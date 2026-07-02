import type { TextureSettings, TextureSpotType } from './texture';

const MAX_SPOTS = 40;

type Spot = { x: number; y: number; radius: number; opacity: number };

type HalftoneRenderer = {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  buffer: WebGLBuffer;
  maskTexture: WebGLTexture;
  width: number;
  height: number;
};

const rendererCache = new WeakMap<HTMLCanvasElement, HalftoneRenderer | null>();

const VERT_SRC = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG_SRC = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
varying vec2 v_uv;
uniform vec2 u_size;
uniform vec3 u_color;
uniform float u_opacity;
uniform float u_spacing;
uniform float u_minSize;
uniform float u_maxSize;
uniform float u_yOffset;
uniform float u_threshold;
uniform float u_contrast;
uniform float u_randomness;
uniform float u_seed;
uniform float u_flowX;
uniform float u_flowY;
uniform float u_spotBlur;
uniform int u_spotType;
uniform int u_spotCount;
uniform vec4 u_spots[${MAX_SPOTS}];
uniform int u_tileType;
uniform int u_symbol;
uniform vec4 u_fade;
uniform bool u_maskEnabled;
uniform sampler2D u_mask;
uniform bool u_turbulenceEnabled;
uniform float u_turbulenceStrength;
uniform float u_turbulenceSmoothness;
uniform float u_turbulenceSeed;

float clamp01(float v) { return clamp(v, 0.0, 1.0); }
float hash12(vec2 p, float seed) {
  return fract(sin(dot(p, vec2(127.1, 311.7)) + seed * 17.23) * 43758.5453123);
}
float fadeNoise(float t) { return t * t * (3.0 - 2.0 * t); }
float valueNoise(vec2 p, float seed) {
  vec2 i = floor(p);
  vec2 f = vec2(fadeNoise(fract(p.x)), fadeNoise(fract(p.y)));
  float a = hash12(i, seed);
  float b = hash12(i + vec2(1.0, 0.0), seed);
  float c = hash12(i + vec2(0.0, 1.0), seed);
  float d = hash12(i + vec2(1.0, 1.0), seed);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
vec2 turbulence(vec2 p) {
  if (!u_turbulenceEnabled || u_turbulenceStrength <= 0.0) return vec2(0.0);
  float scale = 1.0 / max(8.0, u_turbulenceSmoothness);
  float amp = 1.0;
  float norm = 0.0;
  vec2 sum = vec2(0.0);
  float freq = 1.0;
  for (int i = 0; i < 3; i++) {
    sum.x += (valueNoise(p * scale * freq, u_turbulenceSeed + float(i) * 19.0) * 2.0 - 1.0) * amp;
    sum.y += (valueNoise(p * scale * freq, u_turbulenceSeed + float(i) * 19.0 + 7.0) * 2.0 - 1.0) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.0;
  }
  return sum * (u_turbulenceStrength / max(0.0001, norm));
}
float spotIntensity(vec2 p) {
  if (u_spotType == 2) {
    float min1 = 1.0e20;
    float min2 = 1.0e20;
    float closestOpacity = 1.0;
    for (int i = 0; i < ${MAX_SPOTS}; i++) {
      if (i >= u_spotCount) break;
      vec4 spot = u_spots[i];
      float spread = max(8.0, spot.z + u_spotBlur);
      float d = length(p - spot.xy) / spread / max(0.01, spot.w);
      if (d < min1) {
        min2 = min1;
        min1 = d;
        closestOpacity = spot.w;
      } else if (d < min2) {
        min2 = d;
      }
    }
    if (min2 <= 0.001) return 0.0;
    float t = clamp01((min2 - min1) / min2);
    return t * t * (3.0 - 2.0 * t) * closestOpacity;
  }

  float intensity = 0.0;
  for (int i = 0; i < ${MAX_SPOTS}; i++) {
    if (i >= u_spotCount) break;
    vec4 spot = u_spots[i];
    vec2 d = p - spot.xy;
    float spread = max(8.0, spot.z + u_spotBlur);
    if (u_spotType == 1) {
      float proj = dot(d, vec2(u_flowX, u_flowY));
      float perp = dot(d, vec2(-u_flowY, u_flowX));
      float waveFreq = 3.14159265 / (spread * 0.7);
      intensity += (cos(proj * waveFreq) + 1.0) * 0.5 * exp(-(perp * perp) / (spread * spread)) * spot.w;
    } else if (u_spotType == 3) {
      float dist = length(d);
      float ringFreq = 3.14159265 / (spread * 0.3);
      intensity += (cos(dist * ringFreq) + 1.0) * 0.5 * exp(-dist / (spread * 1.6)) * spot.w;
    } else if (u_spotType == 4) {
      float proj = dot(d, vec2(u_flowX, u_flowY));
      float perp = dot(d, vec2(-u_flowY, u_flowX));
      intensity += exp(-(perp * perp) / (2.0 * spread * spread * 0.1)) * exp(-(proj * proj) / (2.0 * spread * spread * 5.0)) * spot.w;
    } else {
      intensity += exp(-dot(d, d) / (2.0 * spread * spread)) * spot.w;
    }
  }
  return intensity;
}
float shapeAlpha(vec2 delta, float radius, float aa) {
  if (u_symbol == 1) {
    vec2 q = abs(delta) - vec2(radius);
    float d = length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0);
    return 1.0 - smoothstep(-aa, aa, d);
  }
  if (u_symbol == 2) {
    float d = (abs(delta.x) + abs(delta.y)) - radius * 1.35;
    return 1.0 - smoothstep(-aa, aa, d);
  }
  if (u_symbol == 3) {
    float arm = max(0.7, radius * 0.45);
    vec2 qv = abs(delta) - vec2(arm, radius * 1.45);
    vec2 qh = abs(delta) - vec2(radius * 1.45, arm);
    float dv = length(max(qv, vec2(0.0))) + min(max(qv.x, qv.y), 0.0);
    float dh = length(max(qh, vec2(0.0))) + min(max(qh.x, qh.y), 0.0);
    return 1.0 - smoothstep(-aa, aa, min(dv, dh));
  }
  if (u_symbol == 4) {
    float d1 = abs(delta.x) + abs(delta.y) - radius * 1.25;
    float d2 = max(abs(delta.x), abs(delta.y)) - radius * 0.58;
    return 1.0 - smoothstep(-aa, aa, min(d1, d2));
  }
  float d = length(delta) - radius;
  return 1.0 - smoothstep(-aa, aa, d);
}
void main() {
  vec2 p = v_uv * u_size;
  float rowStep = u_tileType == 1 ? u_spacing * 0.8660254037844386 : u_spacing;
  float row = floor(p.y / rowStep);
  float rowOffset = (u_tileType == 1 && mod(row, 2.0) > 0.5) ? u_spacing * 0.5 : 0.0;
  vec2 cell = vec2(floor((p.x - rowOffset) / u_spacing), row);
  vec2 center = vec2((cell.x + 0.5) * u_spacing + rowOffset, (cell.y + 0.5) * rowStep);

  float intensity = spotIntensity(center);
  float jitter = (hash12(floor(center * 0.7), u_seed) - 0.5) * u_randomness * 0.28;
  float shaped = clamp01((intensity + jitter - u_threshold) * u_contrast);
  if (shaped <= 0.001) discard;

  vec2 turb = turbulence(center);
  vec2 drawCenter = center + turb;
  float baseY = drawCenter.y + (1.0 - shaped * 2.0) * u_yOffset;
  float mask = u_maskEnabled ? texture2D(u_mask, vec2(drawCenter.x / u_size.x, 1.0 - baseY / u_size.y)).r : 1.0;
  if (mask <= 0.001) discard;
  float radius = max(0.05, mix(u_minSize, u_maxSize, shaped) * mask);
  drawCenter.y += (1.0 - shaped * 2.0) * u_yOffset * mask;

  float edgeT = u_fade.x <= 1.0 ? 1.0 : clamp01(drawCenter.y / u_fade.x);
  float edgeB = u_fade.y <= 1.0 ? 1.0 : clamp01((u_size.y - drawCenter.y) / u_fade.y);
  float edgeL = u_fade.z <= 1.0 ? 1.0 : clamp01(drawCenter.x / u_fade.z);
  float edgeR = u_fade.w <= 1.0 ? 1.0 : clamp01((u_size.x - drawCenter.x) / u_fade.w);
  float edge = min(min(edgeT, edgeB), min(edgeL, edgeR));
  // 抗锯齿宽度基于连续坐标 p 的屏幕导数（约 1 像素），而不是 (p - drawCenter)。
  // 后者在 cell 边界处会随 drawCenter 突变，导致 fwidth 飙升并在点之间渲染出网格线。
  float aa = max(0.75, fwidth(p.x) + fwidth(p.y));
  float a = shapeAlpha(p - drawCenter, radius, aa) * u_opacity * shaped * edge * mask;
  if (a <= 0.001) discard;
  gl_FragColor = vec4(u_color * a, a);
}`;

function seededUnit(seed: number, index: number) {
  const x = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function parseHexRgb(hex: string) {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#BFC1B9';
  const n = Number.parseInt(normalized.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('Halftone WebGL shader compile failed:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext) {
  const vert = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
  const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vert || !frag) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('Halftone WebGL program link failed:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function getRenderer(canvas: HTMLCanvasElement) {
  if (rendererCache.has(canvas)) return rendererCache.get(canvas) ?? null;
  const gl = canvas.getContext('webgl', {
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
  if (!gl.getExtension('OES_standard_derivatives')) {
    rendererCache.set(canvas, null);
    return null;
  }
  const program = createProgram(gl);
  const buffer = gl.createBuffer();
  const maskTexture = gl.createTexture();
  if (!program || !buffer || !maskTexture) {
    rendererCache.set(canvas, null);
    return null;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.bindTexture(gl.TEXTURE_2D, maskTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const renderer = { gl, program, buffer, maskTexture, width: 0, height: 0 };
  rendererCache.set(canvas, renderer);
  return renderer;
}

function spotTypeToUniform(type: TextureSpotType) {
  if (type === 'wave') return 1;
  if (type === 'cellular') return 2;
  if (type === 'ripple') return 3;
  if (type === 'streak') return 4;
  return 0;
}

function symbolToUniform(symbol: TextureSettings['symbol']) {
  if (symbol === 'square') return 1;
  if (symbol === 'diamond') return 2;
  if (symbol === 'plus') return 3;
  if (symbol === 'star') return 4;
  return 0;
}

function computeSpots(settings: TextureSettings, width: number, height: number, effectiveNow: number) {
  const count = Math.max(1, Math.min(MAX_SPOTS, Math.round(settings.spotCount)));
  const angle = (settings.directionDeg * Math.PI) / 180;
  const flowX = Math.cos(angle);
  const flowY = Math.sin(angle);
  const animOn = settings.animEnabled !== false;
  const time = effectiveNow * 0.00004 * settings.speed;
  const spotType = settings.spotType || 'gaussian';
  const spreadRange = settings.spotSize;
  const wrapPad = spotType === 'gaussian' ? spreadRange + 80 : Math.max(spreadRange + 80, spreadRange * 2.5);
  const wrapW = width + wrapPad * 2;
  const wrapH = height + wrapPad * 2;
  const spotScale = Math.max(0.1, settings.spotScale ?? 1);
  const ofsX = settings.spotOffsetX ?? 0;
  const ofsY = settings.spotOffsetY ?? 0;
  const coherence = settings.coherence ?? 1;
  const maxDim = Math.max(width, height);
  const animType = settings.animType || 'drift';

  const primary: Spot[] = Array.from({ length: count }, (_, i) => {
    const driftRate = 0.72 + seededUnit(settings.seed, i * 7 + 3) * 0.72;
    const baseX = seededUnit(settings.seed, i * 7 + 1) * width;
    const baseY = seededUnit(settings.seed, i * 7 + 2) * height;
    const phase = seededUnit(settings.seed, i * 7 + 5) * Math.PI * 2;
    let rawX = baseX;
    let rawY = baseY;
    let opacity = 1;
    let radiusMul = 1;

    if (animType === 'breathe') {
      if (animOn) {
        const rate = 0.0008 * settings.speed;
        const amp = 0.25 + settings.randomness * 0.55;
        radiusMul = 1 + amp * Math.sin(effectiveNow * rate + phase);
        const wobAmp = settings.spotSize * 0.04 * settings.randomness;
        rawX += Math.sin(effectiveNow * rate * 0.6 + phase + 1.5) * wobAmp;
        rawY += Math.cos(effectiveNow * rate * 0.6 + phase + 2.3) * wobAmp;
      }
    } else if (animType === 'vortex') {
      if (animOn) {
        const vcx = width / 2;
        const vcy = height / 2;
        const dx = baseX - vcx;
        const dy = baseY - vcy;
        const dist = Math.hypot(dx, dy);
        const baseAngle = Math.atan2(dy, dx);
        const rotSpeed = 0.0003 * settings.speed * (1 + (seededUnit(settings.seed, i * 7 + 3) - 0.5) * settings.randomness * 0.6);
        const curAngle = baseAngle + effectiveNow * rotSpeed;
        rawX = ((vcx + Math.cos(curAngle) * dist + wrapPad) % wrapW + wrapW) % wrapW - wrapPad;
        rawY = ((vcy + Math.sin(curAngle) * dist + wrapPad) % wrapH + wrapH) % wrapH - wrapPad;
        if (coherence > 0) {
          const fadePx = Math.max(1, driftRate * maxDim * settings.speed * coherence * 0.04);
          const fd = Math.min(Math.min(wrapW, wrapH) * 0.45, fadePx);
          const wpx = rawX + wrapPad;
          const wpy = rawY + wrapPad;
          opacity = Math.min(wpx / fd, (wrapW - wpx) / fd, wpy / fd, (wrapH - wpy) / fd);
          opacity = Math.max(0, Math.min(1, opacity));
          opacity = opacity * opacity * (3 - 2 * opacity);
        }
      }
    } else if (animType === 'wave') {
      if (animOn) {
        const waveFreq = 0.0005 * settings.speed;
        const waveAmp = settings.spotSize * (0.3 + settings.randomness * 0.7);
        const spatialPhase = (baseX * flowX + baseY * flowY) * 0.01;
        const totalPhase = spatialPhase + phase * settings.randomness;
        const perpOsc = Math.sin(effectiveNow * waveFreq + totalPhase) * waveAmp;
        const flowOsc = Math.cos(effectiveNow * waveFreq * 0.4 + totalPhase + 1.0) * waveAmp * 0.25;
        rawX += flowX * flowOsc - flowY * perpOsc;
        rawY += flowY * flowOsc + flowX * perpOsc;
      }
    } else if (animType === 'float') {
      if (animOn) {
        const phase2 = seededUnit(settings.seed, i * 7 + 4) * Math.PI * 2;
        const amp = settings.spotSize * 0.5 * (0.4 + settings.randomness * 0.6);
        const t = effectiveNow * 0.0003 * settings.speed;
        rawX += (Math.sin(t * 1.1 + phase) * 0.6 + Math.sin(t * 0.7 + phase2) * 0.4) * amp;
        rawY += (Math.cos(t * 0.9 + phase + 1.5) * 0.6 + Math.cos(t * 1.3 + phase2 + 0.7) * 0.4) * amp;
      }
    } else if (animOn) {
      const drift = (time * driftRate + seededUnit(settings.seed, i * 7 + 4)) * maxDim;
      const wobble = Math.sin(effectiveNow * 0.00018 * settings.speed + phase) * settings.randomness * settings.spotSize * 0.16;
      rawX = ((baseX + flowX * drift - flowY * wobble + wrapPad) % wrapW + wrapW) % wrapW - wrapPad;
      rawY = ((baseY + flowY * drift + flowX * wobble + wrapPad) % wrapH + wrapH) % wrapH - wrapPad;
      if (coherence > 0) {
        const fadePx = driftRate * maxDim * settings.speed * coherence * 0.04;
        const wrapPosX = rawX + wrapPad;
        const wrapPosY = rawY + wrapPad;
        if (Math.abs(flowX) > 0.05) {
          const fdx = Math.min(wrapW * 0.45, Math.max(1, Math.abs(flowX) * fadePx));
          opacity = Math.min(opacity, wrapPosX / fdx, (wrapW - wrapPosX) / fdx);
        }
        if (Math.abs(flowY) > 0.05) {
          const fdy = Math.min(wrapH * 0.45, Math.max(1, Math.abs(flowY) * fadePx));
          opacity = Math.min(opacity, wrapPosY / fdy, (wrapH - wrapPosY) / fdy);
        }
        opacity = Math.max(0, Math.min(1, opacity));
        opacity = opacity * opacity * (3 - 2 * opacity);
      }
    }

    const cx = width / 2;
    const cy = height / 2;
    const x = (rawX - cx) * spotScale + cx + ofsX;
    const y = (rawY - cy) * spotScale + cy + ofsY;
    const radius = settings.spotSize * (0.72 + seededUnit(settings.seed, i * 7 + 6) * 0.62) * spotScale * radiusMul;
    return { x, y, radius, opacity };
  });

  if (spotType === 'gaussian') return primary;
  const spots: Spot[] = [];
  const ghostMargin = spreadRange * 3;
  for (const spot of primary) {
    spots.push(spot);
    const offsets: [number, number][] = [
      [wrapW, 0], [-wrapW, 0], [0, wrapH], [0, -wrapH],
      [wrapW, wrapH], [wrapW, -wrapH], [-wrapW, wrapH], [-wrapW, -wrapH],
    ];
    for (const [ox, oy] of offsets) {
      if (spots.length >= MAX_SPOTS) break;
      const gx = spot.x + ox;
      const gy = spot.y + oy;
      if (gx > -ghostMargin && gx < width + ghostMargin && gy > -ghostMargin && gy < height + ghostMargin) {
        spots.push({ x: gx, y: gy, radius: spot.radius, opacity: spot.opacity });
      }
    }
  }
  return spots.slice(0, MAX_SPOTS);
}

export function renderHalftoneWebGL(
  canvas: HTMLCanvasElement,
  settings: TextureSettings,
  width: number,
  height: number,
  effectiveNow: number,
  maskCanvas: HTMLCanvasElement | null,
) {
  if (settings.textureType !== 'halftone' || settings.symbol === 'chars' || settings.mouseInteractive || settings.activationEnabled) return false;
  const renderer = getRenderer(canvas);
  if (!renderer) return false;
  const { gl, program, buffer, maskTexture } = renderer;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  const rgb = parseHexRgb(settings.dotColor);
  const angle = (settings.directionDeg * Math.PI) / 180;
  const spots = computeSpots(settings, width, height, effectiveNow);
  const spotData = new Float32Array(MAX_SPOTS * 4);
  for (let i = 0; i < spots.length; i += 1) {
    spotData[i * 4] = spots[i].x;
    spotData[i * 4 + 1] = spots[i].y;
    spotData[i * 4 + 2] = spots[i].radius;
    spotData[i * 4 + 3] = spots[i].opacity;
  }

  gl.viewport(0, 0, width, height);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const aPos = gl.getAttribLocation(program, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uniform = (name: string) => gl.getUniformLocation(program, name);
  gl.uniform2f(uniform('u_size'), width, height);
  gl.uniform3f(uniform('u_color'), rgb.r / 255, rgb.g / 255, rgb.b / 255);
  gl.uniform1f(uniform('u_opacity'), settings.dotOpacity);
  gl.uniform1f(uniform('u_spacing'), settings.dotSpacing);
  gl.uniform1f(uniform('u_minSize'), settings.dotEnabled === false ? 0 : settings.dotMinSize);
  gl.uniform1f(uniform('u_maxSize'), settings.dotEnabled === false ? Math.max(width, height) : settings.dotMaxSize);
  gl.uniform1f(uniform('u_yOffset'), settings.dotYOffsetMap);
  gl.uniform1f(uniform('u_threshold'), settings.threshold);
  gl.uniform1f(uniform('u_contrast'), settings.contrast);
  gl.uniform1f(uniform('u_randomness'), settings.randomness);
  gl.uniform1f(uniform('u_seed'), settings.seed);
  gl.uniform1f(uniform('u_flowX'), Math.cos(angle));
  gl.uniform1f(uniform('u_flowY'), Math.sin(angle));
  gl.uniform1f(uniform('u_spotBlur'), settings.spotBlur ?? 0);
  gl.uniform1i(uniform('u_spotType'), spotTypeToUniform(settings.spotType || 'gaussian'));
  gl.uniform1i(uniform('u_spotCount'), spots.length);
  gl.uniform4fv(uniform('u_spots[0]'), spotData);
  gl.uniform1i(uniform('u_tileType'), settings.dotTileType === 'hexagon' ? 1 : 0);
  gl.uniform1i(uniform('u_symbol'), symbolToUniform(settings.symbol));
  gl.uniform4f(
    uniform('u_fade'),
    height * settings.fadeEdgeTop * 0.6,
    height * settings.fadeEdgeBottom * 0.6,
    width * settings.fadeEdgeLeft * 0.6,
    width * settings.fadeEdgeRight * 0.6,
  );
  gl.uniform1i(uniform('u_turbulenceEnabled'), settings.dotTurbulenceEnabled ? 1 : 0);
  gl.uniform1f(uniform('u_turbulenceStrength'), settings.dotTurbulenceStrength);
  gl.uniform1f(uniform('u_turbulenceSmoothness'), settings.dotTurbulenceSmoothness);
  gl.uniform1f(uniform('u_turbulenceSeed'), settings.dotTurbulenceSeed);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, maskTexture);
  if (settings.spotMaskEnabled && maskCanvas) {
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, maskCanvas);
    gl.uniform1i(uniform('u_maskEnabled'), 1);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.uniform1i(uniform('u_maskEnabled'), 0);
  }
  gl.uniform1i(uniform('u_mask'), 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.flush();
  return true;
}
