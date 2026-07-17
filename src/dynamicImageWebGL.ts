import type { DynamicImageFitType, TextureDynamicImageAlgorithm } from './texture';

const ALGORITHM_INDEX = new Map<TextureDynamicImageAlgorithm, number>([
  ['flowDistort', 0],
  ['ripple', 1],
  ['chromaticAberration', 2],
  ['pixelate', 3],
]);

const VERTEX_SHADER = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_source;
uniform vec2 u_sourceScale;
uniform vec2 u_size;
uniform float u_time;
uniform float u_speed;
uniform float u_strength;
uniform float u_paramA;
uniform float u_paramB;
uniform float u_opacity;
uniform int u_algo;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 fitUv(vec2 uv) {
  return (uv - 0.5) * u_sourceScale + 0.5;
}

bool inRange(vec2 uv) {
  return uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0;
}

vec4 sampleSource(vec2 uv) {
  if (!inRange(uv)) return vec4(0.0);
  return texture2D(u_source, uv);
}

vec2 applyFlow(vec2 uv, float t) {
  float amount = u_strength * 0.08;
  float scaleA = mix(2.0, 18.0, clamp(u_paramA, 0.0, 1.0));
  float scaleB = mix(3.0, 24.0, clamp(u_paramB, 0.0, 1.0));
  float nx = sin((uv.x * scaleA + t) * 3.2 + cos((uv.y * scaleB - t) * 2.7));
  float ny = cos((uv.y * scaleA - t) * 2.8 + sin((uv.x * scaleB + t) * 3.4));
  return uv + vec2(nx, ny) * amount;
}

vec2 applyRipple(vec2 uv, float t) {
  vec2 centered = uv - 0.5;
  float radius = length(centered);
  float density = mix(8.0, 64.0, clamp(u_paramA, 0.0, 1.0));
  float spread = mix(0.1, 2.5, clamp(u_paramB, 0.0, 1.0));
  float centerSoftness = 0.03;
  float centerEnvelope = smoothstep(0.0, centerSoftness, radius);
  float wave = sin(radius * density - t * (1.0 + spread)) * u_strength * 0.04 * centerEnvelope;
  vec2 dir = centered / max(radius, 0.0005);
  return uv + dir * wave;
}

vec4 applyChromatic(vec2 uv, float t) {
  float shift = mix(0.002, 0.03, clamp(u_paramA, 0.0, 1.0)) * u_strength;
  float jitter = (hash12(floor(uv * 360.0 + t * 9.0)) - 0.5) * clamp(u_paramB, 0.0, 1.0) * 0.06 * u_strength;
  vec2 offset = vec2(cos(t * 3.5), sin(t * 2.7 + uv.y * 18.0)) * shift + vec2(jitter, -jitter);
  vec4 r = sampleSource(uv + offset);
  vec4 g = sampleSource(uv);
  vec4 b = sampleSource(uv - offset);
  return vec4(r.r, g.g, b.b, max(r.a, max(g.a, b.a)));
}

vec4 applyPixelate(vec2 uv) {
  float cellSize = max(1.0, floor(u_paramA + 0.5));
  vec2 blocks = max(vec2(1.0), floor(u_size / cellSize));
  vec2 blockUv = 1.0 / blocks;
  vec2 px = (floor(uv * blocks) + 0.5) * blockUv;
  vec4 color = sampleSource(px);
  float sharpen = clamp(u_paramB, 0.0, 1.0);
  vec4 near = sampleSource(px + vec2(blockUv.x * 0.5, 0.0));
  return mix(color, vec4(max(color.rgb * 1.05 - near.rgb * 0.05, vec3(0.0)), color.a), sharpen * 0.4);
}

void main() {
  float t = u_time * max(0.01, u_speed);
  vec2 uv = fitUv(v_uv);
  vec4 baseColor = sampleSource(uv);
  vec4 color;
  if (u_algo == 0) {
    color = sampleSource(applyFlow(uv, t));
  } else if (u_algo == 1) {
    color = sampleSource(applyRipple(uv, t));
  } else if (u_algo == 2) {
    color = applyChromatic(uv, t);
  } else if (u_algo == 3) {
    color = mix(baseColor, applyPixelate(uv), clamp(u_strength, 0.0, 1.0));
  } else {
    color = baseColor;
  }
  float mixAmount = clamp(u_opacity, 0.0, 1.0);
  gl_FragColor = mix(baseColor, color, mixAmount);
}`;

export type DynamicImageGLState = {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  posBuffer: WebGLBuffer;
  sourceTexture: WebGLTexture;
  aPos: number;
  uniforms: Record<string, WebGLUniformLocation | null>;
  lose: WEBGL_lose_context | null;
};

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function createDynamicImageGL(): DynamicImageGLState | null {
  const canvas = document.createElement('canvas');
  const gl = (canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false })
    || canvas.getContext('experimental-webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false })) as WebGLRenderingContext | null;
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vs || !fs) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;

  const posBuffer = gl.createBuffer();
  const sourceTexture = gl.createTexture();
  if (!posBuffer || !sourceTexture) return null;

  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const uniform = (name: string) => gl.getUniformLocation(program, name);
  return {
    canvas,
    gl,
    program,
    posBuffer,
    sourceTexture,
    aPos: gl.getAttribLocation(program, 'a_pos'),
    uniforms: {
      source: uniform('u_source'),
      sourceScale: uniform('u_sourceScale'),
      size: uniform('u_size'),
      time: uniform('u_time'),
      speed: uniform('u_speed'),
      strength: uniform('u_strength'),
      paramA: uniform('u_paramA'),
      paramB: uniform('u_paramB'),
      opacity: uniform('u_opacity'),
      algo: uniform('u_algo'),
    },
    lose: gl.getExtension('WEBGL_lose_context'),
  };
}

function getSourceScale(
  fit: DynamicImageFitType,
  targetWidth: number,
  targetHeight: number,
  sourceWidth: number,
  sourceHeight: number,
) {
  const sourceAspect = sourceWidth / Math.max(1, sourceHeight);
  const targetAspect = targetWidth / Math.max(1, targetHeight);
  if (fit === 'contain') {
    if (sourceAspect >= targetAspect) {
      return [1, sourceAspect / targetAspect] as const;
    }
    return [targetAspect / sourceAspect, 1] as const;
  }
  if (sourceAspect >= targetAspect) {
    return [targetAspect / sourceAspect, 1] as const;
  }
  return [1, sourceAspect / targetAspect] as const;
}

export function renderDynamicImageGL(
  state: DynamicImageGLState,
  options: {
    width: number;
    height: number;
    source: HTMLCanvasElement;
    fit: DynamicImageFitType;
    algorithm: TextureDynamicImageAlgorithm;
    timeSec: number;
    speed: number;
    strength: number;
    paramA: number;
    paramB: number;
    opacity: number;
  },
) {
  const { gl, canvas, program, posBuffer, sourceTexture, uniforms, aPos } = state;
  if (!options.width || !options.height || !options.source.width || !options.source.height) return false;
  if (canvas.width !== options.width || canvas.height !== options.height) {
    canvas.width = options.width;
    canvas.height = options.height;
  }
  gl.viewport(0, 0, options.width, options.height);
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, options.source);

  const [scaleX, scaleY] = getSourceScale(
    options.fit,
    options.width,
    options.height,
    options.source.width,
    options.source.height,
  );
  gl.uniform1i(uniforms.source, 0);
  gl.uniform2f(uniforms.sourceScale, scaleX, scaleY);
  gl.uniform2f(uniforms.size, options.width, options.height);
  gl.uniform1f(uniforms.time, options.timeSec);
  gl.uniform1f(uniforms.speed, Math.max(0.01, options.speed));
  gl.uniform1f(uniforms.strength, Math.max(0, Math.min(1, options.strength)));
  gl.uniform1f(uniforms.paramA, options.paramA);
  gl.uniform1f(uniforms.paramB, options.paramB);
  gl.uniform1f(uniforms.opacity, Math.max(0, Math.min(1, options.opacity)));
  gl.uniform1i(uniforms.algo, ALGORITHM_INDEX.get(options.algorithm) ?? 0);

  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  return true;
}
