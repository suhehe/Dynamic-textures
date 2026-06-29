import type { SmudgeDistortionFilter, SmudgeDistortionStroke, TextureFilter } from './texture';

type BlendMode =
  | 'pass-through'
  | 'normal'
  | 'darken'
  | 'multiply'
  | 'plus-darker'
  | 'color-burn'
  | 'lighten'
  | 'screen'
  | 'plus-lighter'
  | 'color-dodge'
  | 'overlay'
  | 'soft-light'
  | 'hard-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

export type WebGLCompositeLayer =
  | { kind: 'texture'; id: string; blendMode: BlendMode; canvas: HTMLCanvasElement | null }
  | { kind: 'filter'; id: string; filter: TextureFilter };

type FramebufferTarget = {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
};

type DisplacementCache = {
  key: string;
  texture: WebGLTexture;
  range: number;
  packed: boolean;
};

type Renderer = {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  copyProgram: WebGLProgram;
  blendProgram: WebGLProgram;
  smudgeProgram: WebGLProgram;
  buffer: WebGLBuffer;
  sourceTexture: WebGLTexture;
  targets: [FramebufferTarget, FramebufferTarget];
  width: number;
  height: number;
  displacementCache: Map<string, DisplacementCache>;
};

const rendererCache = new WeakMap<HTMLCanvasElement, Renderer | null>();

const VERT_SRC = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const COPY_FRAG_SRC = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
void main() {
  gl_FragColor = texture2D(u_tex, v_uv);
}`;

const BLEND_FRAG_SRC = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_dst;
uniform sampler2D u_src;
uniform int u_mode;

vec3 blendColorBurn(vec3 base, vec3 top) {
  return 1.0 - min(vec3(1.0), (1.0 - base) / max(top, vec3(0.0001)));
}

vec3 blendColorDodge(vec3 base, vec3 top) {
  return min(vec3(1.0), base / max(1.0 - top, vec3(0.0001)));
}

vec3 blendOverlay(vec3 base, vec3 top) {
  return mix(2.0 * base * top, 1.0 - 2.0 * (1.0 - base) * (1.0 - top), step(0.5, base));
}

vec3 blendSoftLight(vec3 base, vec3 top) {
  return mix(
    base - (1.0 - 2.0 * top) * base * (1.0 - base),
    base + (2.0 * top - 1.0) * (sqrt(max(base, vec3(0.0))) - base),
    step(0.5, top)
  );
}

vec3 blendHardLight(vec3 base, vec3 top) {
  return mix(2.0 * base * top, 1.0 - 2.0 * (1.0 - base) * (1.0 - top), step(0.5, top));
}

void main() {
  vec4 dst = texture2D(u_dst, v_uv);
  vec4 src = texture2D(u_src, v_uv);
  vec3 base = dst.a > 0.0001 ? dst.rgb / dst.a : vec3(0.0);
  vec3 top = src.a > 0.0001 ? src.rgb / src.a : vec3(0.0);
  vec3 mixed = top;

  if (u_mode == 1) mixed = min(base, top);
  else if (u_mode == 2) mixed = base * top;
  else if (u_mode == 3) mixed = blendColorBurn(base, top);
  else if (u_mode == 4) mixed = max(base, top);
  else if (u_mode == 5) mixed = 1.0 - (1.0 - base) * (1.0 - top);
  else if (u_mode == 6) mixed = blendColorDodge(base, top);
  else if (u_mode == 7) mixed = blendOverlay(base, top);
  else if (u_mode == 8) mixed = blendSoftLight(base, top);
  else if (u_mode == 9) mixed = blendHardLight(base, top);
  else if (u_mode == 10) mixed = abs(base - top);
  else if (u_mode == 11) mixed = base + top - 2.0 * base * top;

  float outA = src.a + dst.a * (1.0 - src.a);
  vec3 outRgb = (mixed * src.a + dst.rgb * (1.0 - src.a));
  gl_FragColor = vec4(outRgb, outA);
}`;

const SMUDGE_FRAG_SRC = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform sampler2D u_disp;
uniform vec2 u_size;
uniform float u_dispRange;
uniform bool u_dispPacked;
float decode16(vec2 rg) {
  vec2 bytes = floor(rg * 255.0 + 0.5);
  return (bytes.x * 256.0 + bytes.y) / 65535.0;
}
void main() {
  vec2 dispUv = vec2(v_uv.x, 1.0 - v_uv.y);
  vec4 packed = texture2D(u_disp, dispUv);
  vec2 disp = u_dispPacked ? vec2(decode16(packed.rg), decode16(packed.ba)) : packed.rg;
  disp = (disp * 2.0 - 1.0) * u_dispRange;
  vec2 dispUvOffset = vec2(disp.x, -disp.y) * max(u_size.x, u_size.y) / u_size;
  vec2 sampleUv = clamp(v_uv - dispUvOffset, vec2(0.0), vec2(1.0));
  gl_FragColor = texture2D(u_tex, sampleUv);
}`;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('WebGL shader compile failed:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, fragSource: string) {
  const vert = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
  const frag = compile(gl, gl.FRAGMENT_SHADER, fragSource);
  if (!vert || !frag) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('WebGL program link failed:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function createTexture(gl: WebGLRenderingContext) {
  const texture = gl.createTexture();
  if (!texture) return null;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

function createTarget(gl: WebGLRenderingContext, width: number, height: number) {
  const texture = createTexture(gl);
  const framebuffer = gl.createFramebuffer();
  if (!texture || !framebuffer) return null;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return null;
  return { texture, framebuffer };
}

function getRenderer(canvas: HTMLCanvasElement) {
  if (rendererCache.has(canvas)) return rendererCache.get(canvas) ?? null;
  const renderCanvas = document.createElement('canvas');
  const gl = renderCanvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: true,
  });
  if (!gl) {
    rendererCache.set(canvas, null);
    return null;
  }
  const copyProgram = createProgram(gl, COPY_FRAG_SRC);
  const blendProgram = createProgram(gl, BLEND_FRAG_SRC);
  const smudgeProgram = createProgram(gl, SMUDGE_FRAG_SRC);
  const buffer = gl.createBuffer();
  const sourceTexture = createTexture(gl);
  const targetA = createTarget(gl, 1, 1);
  const targetB = createTarget(gl, 1, 1);
  if (!copyProgram || !blendProgram || !smudgeProgram || !buffer || !sourceTexture || !targetA || !targetB) {
    rendererCache.set(canvas, null);
    return null;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const renderer: Renderer = {
    canvas: renderCanvas,
    gl,
    copyProgram,
    blendProgram,
    smudgeProgram,
    buffer,
    sourceTexture,
    targets: [targetA, targetB],
    width: 1,
    height: 1,
    displacementCache: new Map(),
  };
  rendererCache.set(canvas, renderer);
  return renderer;
}

function ensureTargetSize(renderer: Renderer, width: number, height: number) {
  if (renderer.width === width && renderer.height === height) return true;
  renderer.canvas.width = width;
  renderer.canvas.height = height;
  const { gl } = renderer;
  for (const target of renderer.targets) {
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return false;
  }
  renderer.width = width;
  renderer.height = height;
  return true;
}

function bindFullscreen(gl: WebGLRenderingContext, renderer: Renderer, program: WebGLProgram) {
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.buffer);
  const aPos = gl.getAttribLocation(program, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
}

function drawCopy(renderer: Renderer, input: WebGLTexture, output: WebGLFramebuffer | null, width: number, height: number) {
  const { gl, copyProgram } = renderer;
  gl.bindFramebuffer(gl.FRAMEBUFFER, output);
  gl.viewport(0, 0, width, height);
  bindFullscreen(gl, renderer, copyProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, input);
  gl.uniform1i(gl.getUniformLocation(copyProgram, 'u_tex'), 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function uploadCanvas(renderer: Renderer, canvas: HTMLCanvasElement) {
  const { gl, sourceTexture } = renderer;
  gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  return sourceTexture;
}

function hasVisiblePixels(gl: WebGLRenderingContext, width: number, height: number) {
  const samples = [
    [0.5, 0.5],
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75],
  ];
  const pixel = new Uint8Array(4);
  for (const [sx, sy] of samples) {
    const x = clamp(Math.floor(width * sx), 0, width - 1);
    const y = clamp(Math.floor(height * sy), 0, height - 1);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    if (gl.getError() !== gl.NO_ERROR) return false;
    if (pixel[3] > 0) return true;
  }
  return false;
}

function blendModeToUniform(mode: BlendMode) {
  if (mode === 'pass-through' || mode === 'normal') return 0;
  if (mode === 'darken' || mode === 'plus-darker') return 1;
  if (mode === 'multiply') return 2;
  if (mode === 'color-burn') return 3;
  if (mode === 'lighten' || mode === 'plus-lighter') return 4;
  if (mode === 'screen') return 5;
  if (mode === 'color-dodge') return 6;
  if (mode === 'overlay') return 7;
  if (mode === 'soft-light') return 8;
  if (mode === 'hard-light') return 9;
  if (mode === 'difference') return 10;
  if (mode === 'exclusion') return 11;
  return null;
}

function smudgeKey(filter: SmudgeDistortionFilter, width: number, height: number) {
  return `${width}x${height}:${filter.strength}:${filter.precision}:${filter.strokes.map(stroke => (
    `${stroke.brushSize},${stroke.brushStrength},${stroke.brushFeather}:` +
    stroke.points.map(point => `${point.x.toFixed(4)},${point.y.toFixed(4)}`).join(';')
  )).join('|')}`;
}

function addStrokeToField(
  stroke: SmudgeDistortionStroke,
  filterStrength: number,
  width: number,
  height: number,
  precision: number,
  dxField: Float32Array,
  dyField: Float32Array,
) {
  const fieldWidth = width * precision;
  const fieldHeight = height * precision;
  const maxDim = Math.max(width, height);
  const radius = Math.max(2, stroke.brushSize / 2) * precision;
  const feather = Math.max(0, stroke.brushFeather) * precision;
  const spread = radius + feather;
  const inner = Math.max(0, radius - feather);
  const force = stroke.brushStrength * filterStrength * 0.34;
  if (force <= 0 || spread <= 0) return;

  for (let i = 1; i < stroke.points.length; i += 1) {
    const prev = stroke.points[i - 1];
    const next = stroke.points[i];
    const px = prev.x * fieldWidth;
    const py = prev.y * fieldHeight;
    const nx = next.x * fieldWidth;
    const ny = next.y * fieldHeight;
    const moveX = nx - px;
    const moveY = ny - py;
    const sourceMoveX = (next.x - prev.x) * width;
    const sourceMoveY = (next.y - prev.y) * height;
    const distance = Math.hypot(moveX, moveY);
    if (distance < 0.25 * precision) continue;
    const step = Math.max(2, spread * 0.28);
    const steps = Math.max(1, Math.ceil(distance / step));
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      const cx = px + moveX * t;
      const cy = py + moveY * t;
      const minX = Math.max(0, Math.floor(cx - spread));
      const maxX = Math.min(fieldWidth - 1, Math.ceil(cx + spread));
      const minY = Math.max(0, Math.floor(cy - spread));
      const maxY = Math.min(fieldHeight - 1, Math.ceil(cy + spread));
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const dist = Math.hypot(x - cx, y - cy);
          if (dist > spread) continue;
          const featherT = feather <= 0 ? 1 : clamp((spread - dist) / Math.max(1, spread - inner), 0, 1);
          const coreT = dist <= inner ? 1 : featherT * featherT * (3 - 2 * featherT);
          const idx = y * fieldWidth + x;
          dxField[idx] += (sourceMoveX / maxDim) * force * coreT;
          dyField[idx] += (sourceMoveY / maxDim) * force * coreT;
        }
      }
    }
  }
}

function getDisplacementTexture(renderer: Renderer, filterId: string, filter: SmudgeDistortionFilter, width: number, height: number) {
  const key = smudgeKey(filter, width, height);
  const cached = renderer.displacementCache.get(filterId);
  if (cached && cached.key === key) return cached;

  const { gl } = renderer;
  const texture = cached?.texture ?? createTexture(gl);
  if (!texture) return null;
  const supportsFloatDisplacement = Boolean(gl.getExtension('OES_texture_float') && gl.getExtension('OES_texture_float_linear'));
  const precision = Math.max(1, Math.min(4, Math.round(filter.precision)));
  const fieldWidth = width * precision;
  const fieldHeight = height * precision;
  const fieldSize = fieldWidth * fieldHeight;
  const dxField = new Float32Array(fieldSize);
  const dyField = new Float32Array(fieldSize);
  for (const stroke of filter.strokes) {
    addStrokeToField(stroke, filter.strength, width, height, precision, dxField, dyField);
  }

  let range = 0;
  for (let i = 0; i < fieldSize; i += 1) {
    range = Math.max(range, Math.abs(dxField[i]), Math.abs(dyField[i]));
  }
  range = Math.max(1 / 255, Math.min(1, range));

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  if (supportsFloatDisplacement) {
    const data = new Float32Array(fieldSize * 4);
    for (let i = 0; i < fieldSize; i += 1) {
      const idx = i * 4;
      data[idx] = clamp(dxField[i], -range, range) / range * 0.5 + 0.5;
      data[idx + 1] = clamp(dyField[i], -range, range) / range * 0.5 + 0.5;
      data[idx + 2] = 0.5;
      data[idx + 3] = 1;
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fieldWidth, fieldHeight, 0, gl.RGBA, gl.FLOAT, data);
  } else {
    const data = new Uint8Array(fieldSize * 4);
    for (let i = 0; i < fieldSize; i += 1) {
      const idx = i * 4;
      const dx = Math.round((clamp(dxField[i], -range, range) / range * 0.5 + 0.5) * 65535);
      const dy = Math.round((clamp(dyField[i], -range, range) / range * 0.5 + 0.5) * 65535);
      data[idx] = dx >> 8;
      data[idx + 1] = dx & 255;
      data[idx + 2] = dy >> 8;
      data[idx + 3] = dy & 255;
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fieldWidth, fieldHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }
  const nextCache = { key, texture, range, packed: !supportsFloatDisplacement };
  renderer.displacementCache.set(filterId, nextCache);
  return nextCache;
}

function drawBlend(
  renderer: Renderer,
  dstTexture: WebGLTexture,
  srcTexture: WebGLTexture,
  output: WebGLFramebuffer,
  mode: number,
  width: number,
  height: number,
) {
  const { gl, blendProgram } = renderer;
  gl.bindFramebuffer(gl.FRAMEBUFFER, output);
  gl.viewport(0, 0, width, height);
  bindFullscreen(gl, renderer, blendProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, dstTexture);
  gl.uniform1i(gl.getUniformLocation(blendProgram, 'u_dst'), 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, srcTexture);
  gl.uniform1i(gl.getUniformLocation(blendProgram, 'u_src'), 1);
  gl.uniform1i(gl.getUniformLocation(blendProgram, 'u_mode'), mode);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function drawSmudge(
  renderer: Renderer,
  input: WebGLTexture,
  displacement: WebGLTexture,
  displacementRange: number,
  displacementPacked: boolean,
  output: WebGLFramebuffer,
  width: number,
  height: number,
) {
  const { gl, smudgeProgram } = renderer;
  gl.bindFramebuffer(gl.FRAMEBUFFER, output);
  gl.viewport(0, 0, width, height);
  bindFullscreen(gl, renderer, smudgeProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, input);
  gl.uniform1i(gl.getUniformLocation(smudgeProgram, 'u_tex'), 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, displacement);
  gl.uniform1i(gl.getUniformLocation(smudgeProgram, 'u_disp'), 1);
  gl.uniform2f(gl.getUniformLocation(smudgeProgram, 'u_size'), width, height);
  gl.uniform1f(gl.getUniformLocation(smudgeProgram, 'u_dispRange'), displacementRange);
  gl.uniform1i(gl.getUniformLocation(smudgeProgram, 'u_dispPacked'), displacementPacked ? 1 : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

export function drawLayerStackWebGL(
  output: HTMLCanvasElement,
  layers: WebGLCompositeLayer[],
  width: number,
  height: number,
) {
  try {
    const renderer = getRenderer(output);
    if (!renderer || width <= 0 || height <= 0) return false;
    if (layers.some(layer => layer.kind === 'filter' && layer.filter.type !== 'smudgeDistortion')) {
      return false;
    }
    if (layers.some(layer => layer.kind === 'texture' && blendModeToUniform(layer.blendMode) === null)) {
      return false;
    }
    if (!ensureTargetSize(renderer, width, height)) return false;

    const { gl, targets } = renderer;
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, targets[0].framebuffer);
    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, targets[1].framebuffer);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const drawOrder = [...layers].reverse();
    let currentTarget = 0;
    let scratchTarget = 1;
    let hasDrawnLayer = false;

    for (const layer of drawOrder) {
      if (layer.kind === 'texture') {
        if (!layer.canvas || layer.canvas.width <= 0 || layer.canvas.height <= 0) continue;
        const srcTexture = uploadCanvas(renderer, layer.canvas);
        if (!hasDrawnLayer) {
          drawCopy(renderer, srcTexture, targets[currentTarget].framebuffer, width, height);
          hasDrawnLayer = true;
          continue;
        }
        const mode = blendModeToUniform(layer.blendMode);
        if (mode === null) return false;
        drawBlend(renderer, targets[currentTarget].texture, srcTexture, targets[scratchTarget].framebuffer, mode, width, height);
        [currentTarget, scratchTarget] = [scratchTarget, currentTarget];
        continue;
      }

      if (
        !hasDrawnLayer ||
        layer.filter.type !== 'smudgeDistortion' ||
        !layer.filter.enabled ||
        layer.filter.strength <= 0 ||
        layer.filter.strokes.length === 0
      ) continue;
      const displacement = getDisplacementTexture(renderer, layer.id, layer.filter, width, height);
      if (!displacement) return false;
      drawSmudge(renderer, targets[currentTarget].texture, displacement.texture, displacement.range, displacement.packed, targets[scratchTarget].framebuffer, width, height);
      [currentTarget, scratchTarget] = [scratchTarget, currentTarget];
    }

    if (!hasDrawnLayer) return false;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    drawCopy(renderer, targets[currentTarget].texture, null, width, height);
    gl.finish();
    if (!hasVisiblePixels(gl, width, height)) return false;

    const outputCtx = output.getContext('2d');
    if (!outputCtx) return false;
    if (output.width !== width) output.width = width;
    if (output.height !== height) output.height = height;
    outputCtx.setTransform(1, 0, 0, 1, 0, 0);
    outputCtx.clearRect(0, 0, width, height);
    outputCtx.drawImage(renderer.canvas, 0, 0, width, height);
    return true;
  } catch (error) {
    console.warn('WebGL composite failed; falling back to Canvas 2D:', error);
    return false;
  }
}
