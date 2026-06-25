import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { TextureSettings, TextureSpotType, TextureAnimType, TextureActivationType } from '../texture';

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}
function seededUnit(seed: number, index: number) {
  const x = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
function smoothNoiseFade(value: number) {
  return value * value * (3 - 2 * value);
}
function latticeNoise(seed: number, x: number, y: number, channel: number) {
  const hash = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed + channel * 101, 1442695041);
  return seededUnit(seed + channel * 977, hash);
}
function valueNoise2D(seed: number, x: number, y: number, channel: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothNoiseFade(x - x0);
  const ty = smoothNoiseFade(y - y0);
  const n00 = latticeNoise(seed, x0, y0, channel);
  const n10 = latticeNoise(seed, x0 + 1, y0, channel);
  const n01 = latticeNoise(seed, x0, y0 + 1, channel);
  const n11 = latticeNoise(seed, x0 + 1, y0 + 1, channel);
  const nx0 = n00 + (n10 - n00) * tx;
  const nx1 = n01 + (n11 - n01) * tx;
  return nx0 + (nx1 - nx0) * ty;
}
function turbulenceOffset(
  x: number,
  y: number,
  strength: number,
  smoothness: number,
  seed: number,
) {
  if (strength <= 0) return { x: 0, y: 0 };
  const scale = 1 / Math.max(8, smoothness);
  let amp = 1;
  let norm = 0;
  let dx = 0;
  let dy = 0;
  let freq = 1;
  for (let octave = 0; octave < 3; octave += 1) {
    const nx = valueNoise2D(seed, x * scale * freq, y * scale * freq, octave * 2) * 2 - 1;
    const ny = valueNoise2D(seed, x * scale * freq, y * scale * freq, octave * 2 + 1) * 2 - 1;
    dx += nx * amp;
    dy += ny * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  const gain = strength / Math.max(0.0001, norm);
  return { x: dx * gain, y: dy * gain };
}
type Spot = { x: number; y: number; radius: number; opacity: number };
function computeSpotIntensity(
  px: number, py: number,
  spots: Spot[],
  spotType: TextureSpotType,
  blur: number,
  flowX: number, flowY: number,
): number {
  if (spotType === 'cellular') {
    let min1 = Infinity, min2 = Infinity;
    let closestOpacity = 1;
    for (const spot of spots) {
      const dx = px - spot.x;
      const dy = py - spot.y;
      const spread = Math.max(8, spot.radius + blur);
      const d = Math.sqrt(dx * dx + dy * dy) / spread / Math.max(0.01, spot.opacity);
      if (d < min1) { min2 = min1; min1 = d; closestOpacity = spot.opacity; }
      else if (d < min2) { min2 = d; }
    }
    if (min2 <= 0.001) return 0;
    const t = clamp01((min2 - min1) / min2);
    return t * t * (3 - 2 * t) * closestOpacity;
  }
  let intensity = 0;
  for (const spot of spots) {
    const dx = px - spot.x;
    const dy = py - spot.y;
    const spread = Math.max(8, spot.radius + blur);
    const o = spot.opacity;
    if (spotType === 'wave') {
      const proj = dx * flowX + dy * flowY;
      const perp = -dx * flowY + dy * flowX;
      const waveFreq = Math.PI / (spread * 0.7);
      intensity += (Math.cos(proj * waveFreq) + 1) * 0.5 * Math.exp(-(perp * perp) / (spread * spread)) * o;
    } else if (spotType === 'ripple') {
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ringFreq = Math.PI / (spread * 0.3);
      intensity += (Math.cos(dist * ringFreq) + 1) * 0.5 * Math.exp(-dist / (spread * 1.6)) * o;
    } else if (spotType === 'streak') {
      const proj = dx * flowX + dy * flowY;
      const perp = -dx * flowY + dy * flowX;
      intensity += Math.exp(-(perp * perp) / (2 * spread * spread * 0.1))
                 * Math.exp(-(proj * proj) / (2 * spread * spread * 5)) * o;
    } else {
      intensity += Math.exp(-(dx * dx + dy * dy) / (2 * spread * spread)) * o;
    }
  }
  return intensity;
}
function interactionTick(ageMs: number, durationMs: number, initialFrequency: number, finalFrequency: number) {
  const durationSec = Math.max(0.001, durationMs / 1000);
  const ageSec = Math.min(durationSec, Math.max(0, ageMs / 1000));
  const wholeSeconds = Math.floor(ageSec);
  const span = Math.max(1, Math.ceil(durationSec) - 1);
  const frequencyAtSecond = (second: number) => {
    const t = clamp01(second / span);
    return Math.max(0, finalFrequency + (initialFrequency - finalFrequency) * (1 - t));
  };
  let tick = 0;
  for (let second = 0; second < wholeSeconds; second += 1) {
    tick += Math.floor(frequencyAtSecond(second));
  }
  const partial = ageSec - wholeSeconds;
  tick += Math.floor(frequencyAtSecond(wholeSeconds) * partial);
  return tick;
}
function parseHexRgb(hex: string) {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#BFC1B9';
  const n = Number.parseInt(normalized.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function drawDot(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, symbol: TextureSettings['symbol']) {
  if (symbol === 'square') { ctx.fillRect(x - size, y - size, size * 2, size * 2); return; }
  if (symbol === 'diamond') { ctx.beginPath(); ctx.moveTo(x, y - size * 1.3); ctx.lineTo(x + size * 1.3, y); ctx.lineTo(x, y + size * 1.3); ctx.lineTo(x - size * 1.3, y); ctx.closePath(); ctx.fill(); return; }
  if (symbol === 'plus') { const arm = Math.max(0.7, size * 0.45); ctx.fillRect(x - arm, y - size * 1.45, arm * 2, size * 2.9); ctx.fillRect(x - size * 1.45, y - arm, size * 2.9, arm * 2); return; }
  if (symbol === 'star') {
    const scale = (size * 2) / 11;
    ctx.save();
    ctx.translate(x - 5.5 * scale, y - 5.5 * scale);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.moveTo(5.5, 9);
    ctx.bezierCurveTo(5.5, 7.06701, 7.067, 5.5, 9, 5.5);
    ctx.bezierCurveTo(7.067, 5.5, 5.5, 3.93299, 5.5, 2);
    ctx.bezierCurveTo(5.5, 3.933, 3.93299, 5.5, 2, 5.5);
    ctx.bezierCurveTo(3.93299, 5.5, 5.5, 7.067, 5.5, 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
}

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  charSet: string[],
  seed: number,
  tick: number,
  xSeed: number,
  ySeed: number,
  alpha: number,
) {
  if (!charSet.length) return;
  const charIndex = Math.floor(seededUnit(seed + tick + 101, Math.floor(xSeed * 31 + ySeed * 11)) * charSet.length) % charSet.length;
  const char = charSet[charIndex] || charSet[0] || '0';
  ctx.globalAlpha = alpha;
  ctx.font = `${Math.max(8, size * 5.2)}px 'PingFang SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(char, x, y + 0.2);
}

// ===== 流动渐变（流体噪声）WebGL 着色器 =====
// 原理：多重 simplex 噪声 (FBM) + 域扭曲 (domain warping)，将扭曲后的噪声场
// 映射到用户配置的渐变色带，产生平滑流动的有机渐变（参考 gradientora 背景动画）。
const FLOW_MAX_STOPS = 8;
const FLOW_VERT_SRC = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;
const FLOW_FRAG_SRC = `
precision highp float;
varying vec2 v_uv;
uniform float u_time;
uniform float u_scaleX;
uniform float u_scaleY;
uniform float u_rotation;
uniform float u_warp;
uniform float u_soft;
uniform float u_aspect;
uniform int u_octaves;
uniform vec3 u_col[${FLOW_MAX_STOPS}];
uniform float u_pos[${FLOW_MAX_STOPS}];
uniform float u_alpha[${FLOW_MAX_STOPS}];
uniform int u_count;

vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x){ return mod289(((x * 34.0) + 1.0) * x); }
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
// 归一化 FBM：层数（复杂度）越高细节越丰富，返回值约在 [-1,1]
float fbm(vec2 p, int oct){
  float s = 0.0;
  float a = 0.5;
  float norm = 0.0;
  for (int i = 0; i < ${FLOW_MAX_STOPS - 2}; i++) {
    if (i < oct) {
      s += a * snoise(p);
      norm += a;
      p = p * 2.02;
      a *= 0.5;
    }
  }
  return s / max(0.0001, norm);
}
// 沿色标位置插值的渐变带；用 smoothstep 缓动让相邻颜色衔接更柔和
vec4 ramp(float t){
  t = clamp(t, 0.0, 1.0);
  vec3 c = u_col[0];
  float al = u_alpha[0];
  for (int i = 0; i < ${FLOW_MAX_STOPS - 1}; i++) {
    if (i + 1 <= u_count - 1) {
      float seg = clamp((t - u_pos[i]) / max(0.0001, u_pos[i + 1] - u_pos[i]), 0.0, 1.0);
      seg = seg * seg * (3.0 - 2.0 * seg);
      float on = step(u_pos[i], t);
      c  = mix(c,  mix(u_col[i],   u_col[i + 1],   seg), on);
      al = mix(al, mix(u_alpha[i], u_alpha[i + 1], seg), on);
    }
  }
  return vec4(c, al);
}
void main(){
  vec2 centered = v_uv - 0.5;
  float cosR = cos(u_rotation);
  float sinR = sin(u_rotation);
  vec2 rotated = vec2(centered.x * cosR - centered.y * sinR, centered.x * sinR + centered.y * cosR);
  vec2 p = (rotated + 0.5) * vec2(u_scaleX, u_scaleY);
  float t = u_time;
  int oct = u_octaves;

  // 双重域扭曲：把噪声场反复折叠，得到连贯流动的有机条带（参考 gradientora 背景）
  vec2 q = vec2(
    fbm(p + vec2(0.0, 0.0) + 0.06 * t, oct),
    fbm(p + vec2(4.7, 2.3) - 0.05 * t, oct)
  );
  vec2 r = vec2(
    fbm(p + u_warp * q + vec2(1.7, 9.2) + 0.10 * t, oct),
    fbm(p + u_warp * q + vec2(8.3, 2.8) - 0.08 * t, oct)
  );
  float f = fbm(p + u_warp * r, oct);
  f = 0.5 + 0.5 * f;

  // 柔和度：压低噪声对比，弱化陡变处的硬色带，过渡更柔和（0=原始对比，1=最柔和）
  float s = clamp(u_soft, 0.0, 1.0);
  float compress = mix(1.0, 0.18, s);
  f = 0.5 + (f - 0.5) * compress;

  gl_FragColor = ramp(f);
}`;

type FlowGL = {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  buffer: WebGLBuffer;
  aPos: number;
  u: Record<string, WebGLUniformLocation | null>;
  lose: WEBGL_lose_context | null;
};

type MaskSnapshot = {
  imageData: ImageData;
  width: number;
  height: number;
};

export type DynamicTextureCanvasHandle = {
  canvas: HTMLCanvasElement | null;
  undoMask: () => void;
  resetMask: () => void;
};

function createFlowGL(): FlowGL | null {
  const canvas = document.createElement('canvas');
  const gl = (canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false })
    || canvas.getContext('experimental-webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false })) as WebGLRenderingContext | null;
  if (!gl) return null;
  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { gl.deleteShader(sh); return null; }
    return sh;
  };
  const vs = compile(gl.VERTEX_SHADER, FLOW_VERT_SRC);
  const fs = compile(gl.FRAGMENT_SHADER, FLOW_FRAG_SRC);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  const buffer = gl.createBuffer();
  if (!buffer) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const u = (name: string) => gl.getUniformLocation(program, name);
  return {
    canvas, gl, program, buffer,
    aPos: gl.getAttribLocation(program, 'a_pos'),
    u: {
      time: u('u_time'), scaleX: u('u_scaleX'), scaleY: u('u_scaleY'), rotation: u('u_rotation'),
      warp: u('u_warp'), soft: u('u_soft'),
      aspect: u('u_aspect'), octaves: u('u_octaves'),
      col: u('u_col[0]'), pos: u('u_pos[0]'), alpha: u('u_alpha[0]'), count: u('u_count'),
    },
    lose: gl.getExtension('WEBGL_lose_context'),
  };
}

function renderFlowGL(
  state: FlowGL, w: number, h: number,
  stops: { position: number; color: string; opacity: number }[],
  scaleX: number, scaleY: number, rotation: number,
  warp: number, softness: number, complexity: number, timeSec: number,
) {
  const { gl, program, buffer, canvas, u, aPos } = state;
  const maxDim = 720;
  const longest = Math.max(w, h);
  const s = longest > maxDim ? maxDim / longest : 1;
  const rw = Math.max(2, Math.round(w * s));
  const rh = Math.max(2, Math.round(h * s));
  if (canvas.width !== rw || canvas.height !== rh) { canvas.width = rw; canvas.height = rh; }
  gl.viewport(0, 0, rw, rh);
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const n = Math.min(FLOW_MAX_STOPS, stops.length);
  const cols = new Float32Array(FLOW_MAX_STOPS * 3);
  const poss = new Float32Array(FLOW_MAX_STOPS);
  const alphas = new Float32Array(FLOW_MAX_STOPS);
  for (let i = 0; i < n; i += 1) {
    const { r, g, b } = parseHexRgb(stops[i].color);
    cols[i * 3] = r / 255; cols[i * 3 + 1] = g / 255; cols[i * 3 + 2] = b / 255;
    poss[i] = stops[i].position;
    alphas[i] = stops[i].opacity;
  }
  gl.uniform3fv(u.col, cols);
  gl.uniform1fv(u.pos, poss);
  gl.uniform1fv(u.alpha, alphas);
  gl.uniform1i(u.count, n);
  gl.uniform1f(u.time, timeSec);
  gl.uniform1f(u.scaleX, scaleX);
  gl.uniform1f(u.scaleY, scaleY);
  gl.uniform1f(u.rotation, rotation * Math.PI / 180);
  gl.uniform1f(u.warp, warp);
  gl.uniform1f(u.soft, softness);
  gl.uniform1i(u.octaves, Math.max(1, Math.min(6, Math.round(complexity))));
  gl.uniform1f(u.aspect, w / h);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

export const DynamicTextureCanvas = forwardRef<DynamicTextureCanvasHandle, { settings: TextureSettings; width: number; height: number }>(function DynamicTextureCanvas({ settings, width: outputWidth, height: outputHeight }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const brushPreviewRef = useRef<HTMLDivElement>(null);
  const brushPreviewInnerRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef(settings);
  const interactionsRef = useRef<Array<{ x: number; y: number; start: number }>>([]);
  const lastInteractionRef = useRef({ x: -9999, y: -9999, at: 0 });
  const tmpCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const actTexCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const spotMaskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const spotMaskDataRef = useRef<{ data: Uint8ClampedArray; width: number; height: number } | null>(null);
  const spotMaskHistoryRef = useRef<MaskSnapshot[]>([]);
  const spotMaskDirtyRef = useRef(true);
  const maskPaintingRef = useRef(false);
  const lastMaskPointRef = useRef<{ x: number; y: number } | null>(null);
  const lastHoverPointRef = useRef<{ x: number; y: number } | null>(null);
  const maskCanvasSizeRef = useRef({ width: 0, height: 0 });
  const flowGLRef = useRef<FlowGL | null>(null);
  const flowGLInitRef = useRef<boolean>(false);
  const animationTimeRef = useRef<number>(0);
  const lastWallNowRef = useRef<number>(0);
  settingsRef.current = settings;

  const ensureSpotMaskCanvas = (width = maskCanvasSizeRef.current.width, height = maskCanvasSizeRef.current.height) => {
    if (width <= 0 || height <= 0) return null;
    const existing = spotMaskCanvasRef.current;
    if (existing && existing.width === width && existing.height === height) return existing;
    if (existing) {
      spotMaskHistoryRef.current = [];
    }
    const next = document.createElement('canvas');
    next.width = width;
    next.height = height;
    const nextCtx = next.getContext('2d');
    if (!nextCtx) return null;
    nextCtx.fillStyle = '#fff';
    nextCtx.fillRect(0, 0, width, height);
    if (existing && existing.width > 0 && existing.height > 0) {
      nextCtx.imageSmoothingEnabled = true;
      nextCtx.drawImage(existing, 0, 0, existing.width, existing.height, 0, 0, width, height);
    }
    spotMaskCanvasRef.current = next;
    maskCanvasSizeRef.current = { width, height };
    spotMaskDirtyRef.current = true;
    return next;
  };

  const captureSpotMaskSnapshot = (): MaskSnapshot | null => {
    const canvas = ensureSpotMaskCanvas();
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return null;
    return {
      imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
      width: canvas.width,
      height: canvas.height,
    };
  };

  const pushSpotMaskHistory = () => {
    const snapshot = captureSpotMaskSnapshot();
    if (!snapshot) return;
    spotMaskHistoryRef.current.push(snapshot);
    if (spotMaskHistoryRef.current.length > 20) {
      spotMaskHistoryRef.current.shift();
    }
  };

  const restoreSpotMaskSnapshot = (snapshot: MaskSnapshot) => {
    const canvas = ensureSpotMaskCanvas(snapshot.width, snapshot.height);
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.width = snapshot.width;
    canvas.height = snapshot.height;
    maskCanvasSizeRef.current = { width: snapshot.width, height: snapshot.height };
    ctx.putImageData(snapshot.imageData, 0, 0);
    spotMaskDirtyRef.current = true;
  };

  const resetSpotMask = () => {
    const canvas = ensureSpotMaskCanvas();
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    spotMaskDirtyRef.current = true;
  };

  const undoSpotMask = () => {
    const snapshot = spotMaskHistoryRef.current.pop();
    if (!snapshot) return;
    maskPaintingRef.current = false;
    lastMaskPointRef.current = null;
    restoreSpotMaskSnapshot(snapshot);
  };

  useImperativeHandle(ref, () => ({
    canvas: canvasRef.current,
    undoMask: undoSpotMask,
    resetMask: () => {
      maskPaintingRef.current = false;
      lastMaskPointRef.current = null;
      pushSpotMaskHistory();
      resetSpotMask();
    },
  }), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !parent || !ctx) return;

    let animationFrame = 0;
    let width = Math.max(1, Math.round(outputWidth));
    let height = Math.max(1, Math.round(outputHeight));
    const initialNow = performance.now();
    animationTimeRef.current = initialNow;
    lastWallNowRef.current = initialNow;
    const resize = () => {
      width = Math.max(1, Math.round(outputWidth));
      height = Math.max(1, Math.round(outputHeight));
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      maskCanvasSizeRef.current = { width, height };
    };

    const sampleSpotMask = (x: number, y: number) => {
      const current = settingsRef.current;
      if (!current.spotMaskEnabled) return 1;
      const maskCanvas = ensureSpotMaskCanvas();
      const maskCtx = maskCanvas?.getContext('2d');
      if (!maskCanvas || !maskCtx) return 1;
      if (spotMaskDirtyRef.current || !spotMaskDataRef.current || spotMaskDataRef.current.width !== maskCanvas.width || spotMaskDataRef.current.height !== maskCanvas.height) {
        spotMaskDataRef.current = {
          data: maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data,
          width: maskCanvas.width,
          height: maskCanvas.height,
        };
        spotMaskDirtyRef.current = false;
      }
      const mask = spotMaskDataRef.current;
      if (!mask) return 1;
      const mx = Math.max(0, Math.min(mask.width - 1, Math.round(x)));
      const my = Math.max(0, Math.min(mask.height - 1, Math.round(y)));
      return mask.data[(my * mask.width + mx) * 4] / 255;
    };

    const drawSpotMaskStroke = (from: { x: number; y: number }, to: { x: number; y: number }) => {
      const current = settingsRef.current;
      const maskCanvas = ensureSpotMaskCanvas();
      const maskCtx = maskCanvas?.getContext('2d');
      if (!maskCanvas || !maskCtx) return;
      const radius = Math.max(2, current.spotMaskBrushSize / 2);
      const feather = Math.max(0, Math.min(1000, current.spotMaskFeather));
      const spread = radius + feather;
      const innerRadius = Math.max(0, radius - feather);
      const paintOpacity = Math.max(0, Math.min(1, current.spotMaskBrushOpacity));
      const stamp = (x: number, y: number) => {
        const gradient = maskCtx.createRadialGradient(x, y, innerRadius, x, y, spread);
        const color = current.spotMaskBrush === 'white' ? '255,255,255' : '0,0,0';
        if (spread <= innerRadius + 0.001) {
          gradient.addColorStop(0, `rgba(${color},${paintOpacity})`);
          gradient.addColorStop(1, `rgba(${color},${paintOpacity})`);
        } else {
          const hardStop = innerRadius / Math.max(0.001, spread);
          gradient.addColorStop(0, `rgba(${color},${paintOpacity})`);
          gradient.addColorStop(Math.max(0, Math.min(1, hardStop)), `rgba(${color},${paintOpacity})`);
          gradient.addColorStop(1, `rgba(${color},0)`);
        }
        maskCtx.fillStyle = gradient;
        maskCtx.beginPath();
        maskCtx.arc(x, y, spread, 0, Math.PI * 2);
        maskCtx.fill();
      };
      maskCtx.save();
      maskCtx.globalCompositeOperation = 'source-over';
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      const step = Math.max(1, spread * 0.3);
      const steps = Math.max(1, Math.ceil(distance / step));
      for (let i = 0; i <= steps; i += 1) {
        const t = steps === 0 ? 0 : i / steps;
        stamp(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
      }
      maskCtx.restore();
      spotMaskDirtyRef.current = true;
    };

    const syncBrushPreview = (point: { x: number; y: number } | null) => {
      const preview = brushPreviewRef.current;
      const inner = brushPreviewInnerRef.current;
      const current = settingsRef.current;
      if (!preview || !inner) return;
      if (current.textureType !== 'halftone' || !current.spotMaskEnabled || !point) {
        preview.style.opacity = '0';
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const scale = width > 0 ? rect.width / width : 1;
      const size = Math.max(4, current.spotMaskBrushSize);
      const feather = Math.max(0, Math.min(1000, current.spotMaskFeather));
      const outerSize = (size + feather * 2) * scale;
      const innerSize = Math.max(0, size * scale);
      const opacity = Math.max(0, Math.min(1, current.spotMaskBrushOpacity));
      preview.style.opacity = '1';
      preview.style.left = `${point.x * scale}px`;
      preview.style.top = `${point.y * scale}px`;
      preview.style.width = `${outerSize}px`;
      preview.style.height = `${outerSize}px`;
      preview.style.borderColor = current.spotMaskBrush === 'white' ? 'rgba(17,24,39,0.8)' : 'rgba(255,255,255,0.95)';
      preview.style.background = current.spotMaskBrush === 'white' ? `rgba(255,255,255,${Math.max(0.04, opacity * 0.14)})` : `rgba(0,0,0,${Math.max(0.04, opacity * 0.14)})`;
      preview.style.boxShadow = current.spotMaskBrush === 'white'
        ? '0 0 0 1px rgba(255,255,255,0.6)'
        : '0 0 0 1px rgba(0,0,0,0.35)';
      inner.style.width = `${innerSize}px`;
      inner.style.height = `${innerSize}px`;
      inner.style.opacity = feather > 0 && innerSize > 0 ? `${Math.max(0.15, opacity * 0.85)}` : '0';
      inner.style.borderColor = current.spotMaskBrush === 'white' ? 'rgba(17,24,39,0.45)' : 'rgba(255,255,255,0.55)';
    };

    const pointerToCanvasPoint = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width > 0 ? width / rect.width : 1;
      const scaleY = rect.height > 0 ? height / rect.height : 1;
      return {
        x: Math.max(0, Math.min(width, (event.clientX - rect.left) * scaleX)),
        y: Math.max(0, Math.min(height, (event.clientY - rect.top) * scaleY)),
      };
    };

    const onMaskPointerDown = (event: PointerEvent) => {
      const current = settingsRef.current;
      if (!current.enabled || current.textureType !== 'halftone' || !current.spotMaskEnabled || event.button !== 0) return;
      event.preventDefault();
      const point = pointerToCanvasPoint(event);
      pushSpotMaskHistory();
      maskPaintingRef.current = true;
      lastMaskPointRef.current = point;
      drawSpotMaskStroke(point, point);
      canvas.setPointerCapture?.(event.pointerId);
    };

    const onMaskPointerMove = (event: PointerEvent) => {
      const point = pointerToCanvasPoint(event);
      lastHoverPointRef.current = point;
      syncBrushPreview(point);
      if (!maskPaintingRef.current) return;
      event.preventDefault();
      const lastPoint = lastMaskPointRef.current || point;
      drawSpotMaskStroke(lastPoint, point);
      lastMaskPointRef.current = point;
    };

    const onMaskPointerUp = (event: PointerEvent) => {
      if (!maskPaintingRef.current) return;
      maskPaintingRef.current = false;
      lastMaskPointRef.current = null;
      canvas.releasePointerCapture?.(event.pointerId);
    };

    const onMaskPointerEnter = (event: PointerEvent) => {
      const point = pointerToCanvasPoint(event);
      lastHoverPointRef.current = point;
      syncBrushPreview(point);
    };

    const onMaskPointerLeave = () => {
      lastHoverPointRef.current = null;
      syncBrushPreview(null);
    };

    const onPointerMove = (event: PointerEvent) => {
      const current = settingsRef.current;
      if (!current.enabled || current.textureType !== 'halftone' || current.spotMaskEnabled || !current.mouseInteractive) return;
      const rect = canvas.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      if (offsetX < 0 || offsetY < 0 || offsetX > rect.width || offsetY > rect.height) return;
      const scaleX = rect.width > 0 ? width / rect.width : 1;
      const scaleY = rect.height > 0 ? height / rect.height : 1;
      const x = offsetX * scaleX;
      const y = offsetY * scaleY;
      const now = animationTimeRef.current || performance.now();
      const last = lastInteractionRef.current;
      const moved = Math.hypot(x - last.x, y - last.y);
      if (now - last.at < 42 && moved < 18) return;
      lastInteractionRef.current = { x, y, at: now };
      const interactionDuration = current.mouseInteractionDuration * 1000;
      interactionsRef.current = [
        ...interactionsRef.current.filter(item => now - item.start < interactionDuration),
        { x, y, start: now },
      ].slice(-28);
    };

    const draw = (now: number) => {
      const current = settingsRef.current;
      ensureSpotMaskCanvas();
      syncBrushPreview(lastHoverPointRef.current);
      ctx.clearRect(0, 0, width, height);
      if (!current.enabled || width <= 0 || height <= 0) {
        animationFrame = requestAnimationFrame(draw);
        return;
      }

      if (current.animEnabled !== false) {
        animationTimeRef.current += now - lastWallNowRef.current;
      }
      lastWallNowRef.current = now;
      const effectiveNow = animationTimeRef.current;
      const isGradientTexture = current.textureType === 'gradient';
      const isHalftoneTexture = current.textureType === 'halftone';

      if (isGradientTexture && current.gradientStops.length >= 2) {
        const gradAnimType = current.gradientAnimType || 'none';
        let flowDrawn = false;
        if (gradAnimType === 'flow') {
          // 流动渐变：用 WebGL 域扭曲噪声着色器渲染到离屏画布后绘制到主画布，
          // 复现 gradientora 背景那种平滑流动的有机渐变质感。
          if (!flowGLInitRef.current) { flowGLInitRef.current = true; flowGLRef.current = createFlowGL(); }
          const flow = flowGLRef.current;
          if (flow) {
            const tSec = effectiveNow * 0.001 * Math.max(0.01, current.gradientAnimSpeed ?? 0.1);
            renderFlowGL(
              flow, width, height, current.gradientStops,
              current.gradientFlowScaleX ?? 0.1, current.gradientFlowScaleY ?? 0.1,
              current.gradientFlowRotation ?? 0,
              current.gradientFlowWarp ?? 1.5,
              current.gradientFlowSoftness ?? 0.6, current.gradientFlowComplexity ?? 3, tSec,
            );
            ctx.save();
            ctx.globalAlpha = 1;
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(flow.canvas, 0, 0, flow.canvas.width, flow.canvas.height, 0, 0, width, height);
            ctx.restore();
            flowDrawn = true;
          }
        }
        if (!flowDrawn) {
          const gAngleRad = (current.gradientAngle * Math.PI) / 180;
          const cos = Math.cos(gAngleRad);
          const sin = Math.sin(gAngleRad);
          const halfW = width / 2;
          const halfH = height / 2;
          const len = Math.abs(cos) * width + Math.abs(sin) * height;
          const x0 = halfW - cos * len / 2;
          const y0 = halfH - sin * len / 2;
          const x1 = halfW + cos * len / 2;
          const y1 = halfH + sin * len / 2;

          const grad = ctx.createLinearGradient(x0, y0, x1, y1);
          for (const stop of current.gradientStops) {
            const { r, g, b } = parseHexRgb(stop.color);
            grad.addColorStop(stop.position, `rgba(${r},${g},${b},${stop.opacity})`);
          }
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, width, height);
        }

        const gFadeT = height * current.gradientFadeEdgeTop * 0.5;
        const gFadeB = height * current.gradientFadeEdgeBottom * 0.5;
        const gFadeL = width * current.gradientFadeEdgeLeft * 0.5;
        const gFadeR = width * current.gradientFadeEdgeRight * 0.5;
        if (gFadeT > 1 || gFadeB > 1 || gFadeL > 1 || gFadeR > 1) {
          ctx.save();
          ctx.globalCompositeOperation = 'destination-in';
          const fadeGrad = ctx.createLinearGradient(0, 0, 0, height);
          fadeGrad.addColorStop(0, `rgba(255,255,255,${gFadeT > 1 ? 0 : 1})`);
          if (gFadeT > 1) fadeGrad.addColorStop(Math.min(1, gFadeT / height), 'rgba(255,255,255,1)');
          if (gFadeB > 1) fadeGrad.addColorStop(Math.max(0, 1 - gFadeB / height), 'rgba(255,255,255,1)');
          fadeGrad.addColorStop(1, `rgba(255,255,255,${gFadeB > 1 ? 0 : 1})`);
          ctx.fillStyle = fadeGrad;
          ctx.fillRect(0, 0, width, height);
          if (gFadeL > 1 || gFadeR > 1) {
            const fadeGradH = ctx.createLinearGradient(0, 0, width, 0);
            fadeGradH.addColorStop(0, `rgba(255,255,255,${gFadeL > 1 ? 0 : 1})`);
            if (gFadeL > 1) fadeGradH.addColorStop(Math.min(1, gFadeL / width), 'rgba(255,255,255,1)');
            if (gFadeR > 1) fadeGradH.addColorStop(Math.max(0, 1 - gFadeR / width), 'rgba(255,255,255,1)');
            fadeGradH.addColorStop(1, `rgba(255,255,255,${gFadeR > 1 ? 0 : 1})`);
            ctx.fillStyle = fadeGradH;
            ctx.fillRect(0, 0, width, height);
          }
          ctx.restore();
        }
      }

      const rgb = parseHexRgb(current.dotColor);
      const spacing = current.dotSpacing;
      const interactionDuration = current.mouseInteractionDuration * 1000;
      const interactionChars = Array.from(current.mouseInteractionChars || '01');
      const dotSymbolChars = Array.from(current.dotSymbolChars || '01');
      const angle = (current.directionDeg * Math.PI) / 180;
      const flowX = Math.cos(angle);
      const flowY = Math.sin(angle);
      const animOn = current.animEnabled !== false;
      const time = effectiveNow * 0.00004 * current.speed;
      const fadeTop = height * current.fadeEdgeTop * 0.6;
      const fadeBottom = height * current.fadeEdgeBottom * 0.6;
      const fadeLeft = width * current.fadeEdgeLeft * 0.6;
      const fadeRight = width * current.fadeEdgeRight * 0.6;
      const spotType: TextureSpotType = current.spotType || 'gaussian';
      const dotEnabled = current.dotEnabled !== false;
      const count = Math.max(1, Math.round(current.spotCount));
      const spreadRange = current.spotSize;
      const wrapPad = spotType === 'gaussian' ? spreadRange + 80 : Math.max(spreadRange + 80, spreadRange * 2.5);
      const wrapW = width + wrapPad * 2;
      const wrapH = height + wrapPad * 2;
      const spotScale = Math.max(0.1, current.spotScale ?? 1);
      const ofsX = current.spotOffsetX ?? 0;
      const ofsY = current.spotOffsetY ?? 0;
      const coherence = current.coherence ?? 1;
      const maxDim = Math.max(width, height);
      const animType: TextureAnimType = current.animType || 'drift';

      const primarySpots: Spot[] = isHalftoneTexture ? Array.from({ length: count }, (_, i) => {
        const driftRate = 0.72 + seededUnit(current.seed, i * 7 + 3) * 0.72;
        const baseX = seededUnit(current.seed, i * 7 + 1) * width;
        const baseY = seededUnit(current.seed, i * 7 + 2) * height;
        const phase = seededUnit(current.seed, i * 7 + 5) * Math.PI * 2;

        let rawX: number, rawY: number, opacity = 1, radiusMul = 1;

        if (animType === 'breathe') {
          rawX = baseX;
          rawY = baseY;
          if (animOn) {
            const rate = 0.0008 * current.speed;
            const amp = 0.25 + current.randomness * 0.55;
            radiusMul = 1 + amp * Math.sin(effectiveNow * rate + phase);
            const wobAmp = current.spotSize * 0.04 * current.randomness;
            rawX += Math.sin(effectiveNow * rate * 0.6 + phase + 1.5) * wobAmp;
            rawY += Math.cos(effectiveNow * rate * 0.6 + phase + 2.3) * wobAmp;
          }
        } else if (animType === 'vortex') {
          const vcx = width / 2, vcy = height / 2;
          if (animOn) {
            const dx = baseX - vcx, dy = baseY - vcy;
            const dist = Math.hypot(dx, dy);
            const baseAngle = Math.atan2(dy, dx);
            const rotSpeed = 0.0003 * current.speed * (1 + (seededUnit(current.seed, i * 7 + 3) - 0.5) * current.randomness * 0.6);
            const curAngle = baseAngle + effectiveNow * rotSpeed;
            rawX = ((vcx + Math.cos(curAngle) * dist + wrapPad) % wrapW + wrapW) % wrapW - wrapPad;
            rawY = ((vcy + Math.sin(curAngle) * dist + wrapPad) % wrapH + wrapH) % wrapH - wrapPad;
            if (coherence > 0) {
              const fadePx = Math.max(1, driftRate * maxDim * current.speed * coherence * 0.04);
              const fd = Math.min(Math.min(wrapW, wrapH) * 0.45, fadePx);
              const wpx = rawX + wrapPad, wpy = rawY + wrapPad;
              opacity = Math.min(clamp01(wpx / fd), clamp01((wrapW - wpx) / fd), clamp01(wpy / fd), clamp01((wrapH - wpy) / fd));
              opacity = opacity * opacity * (3 - 2 * opacity);
            }
          } else {
            rawX = baseX;
            rawY = baseY;
          }
        } else if (animType === 'wave') {
          rawX = baseX;
          rawY = baseY;
          if (animOn) {
            const waveFreq = 0.0005 * current.speed;
            const waveAmp = current.spotSize * (0.3 + current.randomness * 0.7);
            const spatialPhase = (baseX * flowX + baseY * flowY) * 0.01;
            const totalPhase = spatialPhase + phase * current.randomness;
            const perpOsc = Math.sin(effectiveNow * waveFreq + totalPhase) * waveAmp;
            const flowOsc = Math.cos(effectiveNow * waveFreq * 0.4 + totalPhase + 1.0) * waveAmp * 0.25;
            rawX += flowX * flowOsc - flowY * perpOsc;
            rawY += flowY * flowOsc + flowX * perpOsc;
          }
        } else if (animType === 'float') {
          rawX = baseX;
          rawY = baseY;
          if (animOn) {
            const phase2 = seededUnit(current.seed, i * 7 + 4) * Math.PI * 2;
            const amp = current.spotSize * 0.5 * (0.4 + current.randomness * 0.6);
            const t = effectiveNow * 0.0003 * current.speed;
            rawX += (Math.sin(t * 1.1 + phase) * 0.6 + Math.sin(t * 0.7 + phase2) * 0.4) * amp;
            rawY += (Math.cos(t * 0.9 + phase + 1.5) * 0.6 + Math.cos(t * 1.3 + phase2 + 0.7) * 0.4) * amp;
          }
        } else {
          const drift = (time * driftRate + seededUnit(current.seed, i * 7 + 4)) * maxDim;
          const wobble = animOn
            ? Math.sin(effectiveNow * 0.00018 * current.speed + phase) * current.randomness * current.spotSize * 0.16
            : 0;
          rawX = ((baseX + flowX * drift - flowY * wobble + wrapPad) % wrapW + wrapW) % wrapW - wrapPad;
          rawY = ((baseY + flowY * drift + flowX * wobble + wrapPad) % wrapH + wrapH) % wrapH - wrapPad;
          if (coherence > 0 && animOn) {
            const fadePx = driftRate * maxDim * current.speed * coherence * 0.04;
            const wrapPosX = rawX + wrapPad;
            const wrapPosY = rawY + wrapPad;
            if (Math.abs(flowX) > 0.05) {
              const fdx = Math.min(wrapW * 0.45, Math.max(1, Math.abs(flowX) * fadePx));
              opacity = Math.min(opacity, clamp01(wrapPosX / fdx), clamp01((wrapW - wrapPosX) / fdx));
            }
            if (Math.abs(flowY) > 0.05) {
              const fdy = Math.min(wrapH * 0.45, Math.max(1, Math.abs(flowY) * fadePx));
              opacity = Math.min(opacity, clamp01(wrapPosY / fdy), clamp01((wrapH - wrapPosY) / fdy));
            }
            opacity = opacity * opacity * (3 - 2 * opacity);
          }
        }

        const cx = width / 2, cy = height / 2;
        const x = (rawX - cx) * spotScale + cx + ofsX;
        const y = (rawY - cy) * spotScale + cy + ofsY;
        const radius = current.spotSize * (0.72 + seededUnit(current.seed, i * 7 + 6) * 0.62) * spotScale * radiusMul;
        return { x, y, radius, opacity };
      }) : [];
      let spots: Spot[];
      if (isHalftoneTexture && spotType !== 'gaussian') {
        spots = [];
        const ghostMargin = spreadRange * 3;
        for (const s of primarySpots) {
          spots.push(s);
          const offsets: [number, number][] = [
            [wrapW, 0], [-wrapW, 0], [0, wrapH], [0, -wrapH],
            [wrapW, wrapH], [wrapW, -wrapH], [-wrapW, wrapH], [-wrapW, -wrapH],
          ];
          for (const [ox, oy] of offsets) {
            const gx = s.x + ox, gy = s.y + oy;
            if (gx > -ghostMargin && gx < width + ghostMargin && gy > -ghostMargin && gy < height + ghostMargin) {
              spots.push({ x: gx, y: gy, radius: s.radius, opacity: s.opacity });
            }
          }
        }
      } else {
        spots = primarySpots;
      }

      const spotBlur = current.spotBlur ?? 0;
      const tileType = current.dotTileType === 'hexagon' ? 'hexagon' : 'square';
      const hexRowStep = spacing * 0.8660254037844386;

      if (isHalftoneTexture && !dotEnabled) {
        const scale = Math.max(2, Math.min(6, Math.ceil(Math.sqrt(width * height) / 180)));
        const fw = Math.ceil(width / scale);
        const fh = Math.ceil(height / scale);
        const fieldData = ctx.createImageData(fw, fh);
        const fpx = fieldData.data;
        for (let py = 0; py < fh; py++) {
          const wy = py * scale + scale / 2;
          for (let px = 0; px < fw; px++) {
            const wx = px * scale + scale / 2;
            const intensity = computeSpotIntensity(wx, wy, spots, spotType, spotBlur, flowX, flowY);
            const jitter = (seededUnit(current.seed + Math.floor(wx * 0.7), Math.floor(wy * 0.7)) - 0.5) * current.randomness * 0.28;
            const shaped = clamp01((intensity + jitter - current.threshold) * current.contrast);
            if (shaped <= 0.01) continue;
            const mask = sampleSpotMask(wx, wy);
            if (mask <= 0.01) continue;
            const edgeT = fadeTop <= 1 ? 1 : clamp01(wy / fadeTop);
            const edgeB = fadeBottom <= 1 ? 1 : clamp01((height - wy) / fadeBottom);
            const edgeL = fadeLeft <= 1 ? 1 : clamp01(wx / fadeLeft);
            const edgeR = fadeRight <= 1 ? 1 : clamp01((width - wx) / fadeRight);
            const edge = Math.min(edgeT, edgeB, edgeL, edgeR);
            const alpha = current.dotOpacity * shaped * edge * mask;
            const idx = (py * fw + px) * 4;
            fpx[idx] = rgb.r; fpx[idx + 1] = rgb.g; fpx[idx + 2] = rgb.b; fpx[idx + 3] = Math.round(alpha * 255);
          }
        }
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        if (!tmpCanvasRef.current) tmpCanvasRef.current = document.createElement('canvas');
        const blobTmp = tmpCanvasRef.current;
        if (blobTmp.width !== fw || blobTmp.height !== fh) { blobTmp.width = fw; blobTmp.height = fh; }
        blobTmp.getContext('2d')!.putImageData(fieldData, 0, 0);
        ctx.drawImage(blobTmp, 0, 0, width, height);
        ctx.restore();
        interactionsRef.current = [];
      } else if (isHalftoneTexture) {
        ctx.fillStyle = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
        const activeInteractions = current.mouseInteractive
          ? interactionsRef.current.filter(item => effectiveNow - item.start < interactionDuration)
          : [];
        interactionsRef.current = activeInteractions;

        const actEnabled = current.activationEnabled && dotEnabled;
        const actType: TextureActivationType = current.activationType || 'ripple';
        const actDurationMs = (current.activationDuration || 3) * 1000;
        const actRadX = current.activationRadiusX || 300;
        const actRadY = current.activationRadiusY || 300;
        const actRingW = current.activationRingWidth || 80;
        const actAvgRad = (actRadX + actRadY) / 2;
        const actHalfRingNorm = (actRingW / 2) / Math.max(1, actAvgRad);
        const actCx = width / 2 + (current.activationOffsetX || 0);
        const actCy = height / 2 + (current.activationOffsetY || 0);
        const actChars = Array.from(current.activationChars || '01');
        const actRippleIntMs = (current.activationRippleInterval || 1) * 1000;
        const actRippleProgs: number[] = [];
        if (actEnabled && actType === 'ripple' && actRippleIntMs > 0) {
          const latest = effectiveNow - (effectiveNow % actRippleIntMs);
          for (let ri = 0; ; ri++) {
            const age = effectiveNow - (latest - ri * actRippleIntMs);
            if (age >= actDurationMs) break;
            actRippleProgs.push(age / actDurationMs);
          }
        }
        const actCycleProgress = actEnabled ? (effectiveNow % actDurationMs) / actDurationMs : 0;
        const turbulenceStrength = current.dotTurbulenceEnabled ? current.dotTurbulenceStrength : 0;
        const turbulenceSmoothness = current.dotTurbulenceSmoothness;
        const turbulenceSeed = current.dotTurbulenceSeed;

        for (let row = 0, y = spacing / 2; y < height + spacing; row += 1, y += tileType === 'hexagon' ? hexRowStep : spacing) {
          const rowOffset = tileType === 'hexagon' && row % 2 === 1 ? spacing / 2 : 0;
          for (let x = spacing / 2 + rowOffset; x < width + spacing; x += spacing) {
            const intensity = computeSpotIntensity(x, y, spots, spotType, spotBlur, flowX, flowY);
            const jitter = (seededUnit(current.seed + Math.floor(x * 0.7), Math.floor(y * 0.7)) - 0.5) * current.randomness * 0.28;
            const shaped = clamp01((intensity + jitter - current.threshold) * current.contrast);
            if (shaped <= 0.015) continue;
            const turbulence = turbulenceOffset(x, y, turbulenceStrength, turbulenceSmoothness, turbulenceSeed);
            const drawX = x + turbulence.x;
            const size = current.dotMinSize + (current.dotMaxSize - current.dotMinSize) * shaped;
            const baseDrawY = y + turbulence.y + (1 - shaped * 2) * current.dotYOffsetMap;
            const mask = sampleSpotMask(drawX, baseDrawY);
            if (mask <= 0.01) continue;
            const maskedSize = Math.max(0.05, size * mask);
            const maskedYOffset = current.dotYOffsetMap * mask;
            const drawY = y + turbulence.y + (1 - shaped * 2) * maskedYOffset;

            const edgeT = fadeTop <= 1 ? 1 : clamp01(drawY / fadeTop);
            const edgeB = fadeBottom <= 1 ? 1 : clamp01((height - drawY) / fadeBottom);
            const edgeL = fadeLeft <= 1 ? 1 : clamp01(drawX / fadeLeft);
            const edgeR = fadeRight <= 1 ? 1 : clamp01((width - drawX) / fadeRight);
            const edge = Math.min(edgeT, edgeB, edgeL, edgeR);

            let interactionStrength = 0;
            let interactionCoverage = 0;
            let interactionTickVal = 0;
            const areaAmount = current.mouseInteractionArea;
            if (areaAmount > 0) {
              const areaGate = clamp01((shaped - (1 - areaAmount)) / Math.max(0.001, areaAmount));
              if (areaGate > 0) {
                activeInteractions.forEach((ia) => {
                  const age = effectiveNow - ia.start;
                  const progress = clamp01(age / interactionDuration);
                  const radius = current.mouseInteractionRadius * (1 - progress * 0.25);
                  const distance = Math.hypot(drawX - ia.x, drawY - ia.y);
                  if (distance > radius) return;
                  const easeOut = (1 - progress) * (1 - progress);
                  const localCoverage = areaGate * Math.pow(1 - distance / radius, 1.35);
                  const localStrength = easeOut * localCoverage;
                  if (localStrength > interactionStrength) {
                    interactionStrength = localStrength;
                    interactionCoverage = localCoverage;
                    interactionTickVal = interactionTick(age, interactionDuration, current.mouseInteractionInitialSpeed, current.mouseInteractionFinalSpeed);
                  }
                });
              }
            }

            let actCoverage = 0;
            let actTickVal = 0;
            if (actEnabled) {
              const ndx = (drawX - actCx) / actRadX;
              const ndy = (drawY - actCy) / actRadY;
              const normDist = Math.sqrt(ndx * ndx + ndy * ndy);
              let bestActProg = 0;
              if (actType === 'ripple') {
                for (let ri = 0; ri < actRippleProgs.length; ri++) {
                  const rProg = actRippleProgs[ri];
                  const normDistFromFront = Math.abs(normDist - rProg);
                  if (normDistFromFront < actHalfRingNorm) {
                    const ringFactor = 1 - normDistFromFront / actHalfRingNorm;
                    const fadeEnvelope = Math.sin(rProg * Math.PI);
                    const thisCov = ringFactor * fadeEnvelope;
                    if (thisCov > actCoverage) { actCoverage = thisCov; bestActProg = rProg; }
                  }
                }
              } else if (actType === 'pulse') {
                bestActProg = actCycleProgress;
                const pulseFront = actCycleProgress;
                if (normDist < pulseFront) {
                  const fadeEnvelope = Math.sin(actCycleProgress * Math.PI);
                  actCoverage = clamp01(1 - normDist / pulseFront) * fadeEnvelope;
                }
              } else {
                bestActProg = actCycleProgress;
                const sweepAngle = actCycleProgress * Math.PI * 2;
                const pixelAngle = Math.atan2(drawY - actCy, drawX - actCx);
                let angleDiff = Math.abs(pixelAngle - sweepAngle);
                if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
                const sweepWidth = 0.5;
                if (angleDiff < sweepWidth && normDist < 1) {
                  const fadeEnvelope = 1 - angleDiff / sweepWidth;
                  actCoverage = fadeEnvelope * clamp01(1 - normDist);
                }
              }
              if (actCoverage > 0.01) {
                const ageEquiv = bestActProg * actDurationMs;
                actTickVal = interactionTick(ageEquiv, actDurationMs, current.activationInitialSpeed || 4, current.activationFinalSpeed || 0);
              }
            }

            const totalCoverage = Math.max(interactionCoverage, actCoverage);
            const totalStrength = Math.max(interactionStrength, actCoverage * 0.7);
            const totalTickVal = actCoverage >= interactionCoverage ? actTickVal : interactionTickVal;
            const totalChars = actCoverage >= interactionCoverage ? actChars : interactionChars;

            const shouldDigit = totalCoverage > 0.035
              && seededUnit(current.seed, Math.floor(drawX * 13 + drawY * 29)) < Math.min(1, totalCoverage * 1.85);
            if (current.symbol === 'chars' || shouldDigit) {
              const charSet = shouldDigit ? totalChars : dotSymbolChars;
              const tickVal = shouldDigit ? totalTickVal : Math.floor(effectiveNow * 0.0015 * current.speed);
              const alpha = shouldDigit
                ? Math.min(0.78, (current.dotOpacity * shaped * edge + totalStrength * 0.58) * mask)
                : current.dotOpacity * shaped * edge * mask;
              drawCharacter(ctx, drawX, drawY, maskedSize, charSet, current.seed, tickVal, x, y, alpha);
            } else {
              ctx.globalAlpha = current.dotOpacity * shaped * edge * mask;
              drawDot(ctx, drawX, drawY, maskedSize, current.symbol);
            }
          }
        }
      }
      if (isHalftoneTexture && current.activationEnabled && current.activationShowTexture) {
        const aType: TextureActivationType = current.activationType || 'ripple';
        const aDurMs = (current.activationDuration || 3) * 1000;
        const aRdX = current.activationRadiusX || 300;
        const aRdY = current.activationRadiusY || 300;
        const aRngW = current.activationRingWidth || 80;
        const aAvgRd = (aRdX + aRdY) / 2;
        const aHalfRingN = (aRngW / 2) / Math.max(1, aAvgRd);
        const aCx = width / 2 + (current.activationOffsetX || 0);
        const aCy = height / 2 + (current.activationOffsetY || 0);
        const aProg = (effectiveNow % aDurMs) / aDurMs;
        const aRipIntMs = (current.activationRippleInterval || 1) * 1000;
        const texRippleProgs: number[] = [];
        if (aType === 'ripple' && aRipIntMs > 0) {
          const latest = effectiveNow - (effectiveNow % aRipIntMs);
          for (let ri = 0; ; ri++) {
            const age = effectiveNow - (latest - ri * aRipIntMs);
            if (age >= aDurMs) break;
            texRippleProgs.push(age / aDurMs);
          }
        }
        const texScale = 3;
        const tw = Math.ceil(width / texScale);
        const th = Math.ceil(height / texScale);
        if (!actTexCanvasRef.current) actTexCanvasRef.current = document.createElement('canvas');
        const texBuf = actTexCanvasRef.current;
        if (texBuf.width !== tw || texBuf.height !== th) { texBuf.width = tw; texBuf.height = th; }
        const texCtx = texBuf.getContext('2d')!;
        const texData = texCtx.createImageData(tw, th);
        const tpx = texData.data;
        for (let ty = 0; ty < th; ty++) {
          const wy = ty * texScale + texScale / 2;
          for (let tx = 0; tx < tw; tx++) {
            const wx = tx * texScale + texScale / 2;
            let cov = 0;
            const ndx = (wx - aCx) / aRdX;
            const ndy = (wy - aCy) / aRdY;
            const normDist = Math.sqrt(ndx * ndx + ndy * ndy);
            if (aType === 'ripple') {
              for (let ri = 0; ri < texRippleProgs.length; ri++) {
                const rp = texRippleProgs[ri];
                const normDistFromFront = Math.abs(normDist - rp);
                if (normDistFromFront < aHalfRingN) {
                  const ringFactor = 1 - normDistFromFront / aHalfRingN;
                  const thisCov = ringFactor * Math.sin(rp * Math.PI);
                  if (thisCov > cov) cov = thisCov;
                }
              }
            } else if (aType === 'pulse') {
              const pulseFront = aProg;
              if (normDist < pulseFront) {
                cov = clamp01(1 - normDist / pulseFront) * Math.sin(aProg * Math.PI);
              }
            } else {
              const sweepAng = aProg * Math.PI * 2;
              const pixAng = Math.atan2(wy - aCy, wx - aCx);
              let angDiff = Math.abs(pixAng - sweepAng);
              if (angDiff > Math.PI) angDiff = Math.PI * 2 - angDiff;
              const sweepW = 0.5;
              if (angDiff < sweepW && normDist < 1) {
                cov = (1 - angDiff / sweepW) * clamp01(1 - normDist);
              }
            }
            cov *= sampleSpotMask(wx, wy);
            if (cov > 0.005) {
              const idx = (ty * tw + tx) * 4;
              tpx[idx] = rgb.r; tpx[idx + 1] = rgb.g; tpx[idx + 2] = rgb.b;
              tpx[idx + 3] = Math.round(clamp01(cov) * 220);
            }
          }
        }
        texCtx.putImageData(texData, 0, 0);
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(texBuf, 0, 0, width, height);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      animationFrame = requestAnimationFrame(draw);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    canvas.addEventListener('pointerdown', onMaskPointerDown);
    canvas.addEventListener('pointerenter', onMaskPointerEnter);
    canvas.addEventListener('pointerleave', onMaskPointerLeave);
    window.addEventListener('pointermove', onMaskPointerMove, { passive: false });
    window.addEventListener('pointerup', onMaskPointerUp);
    window.addEventListener('pointercancel', onMaskPointerUp);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    animationFrame = requestAnimationFrame(draw);
    return () => {
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onMaskPointerDown);
      canvas.removeEventListener('pointerenter', onMaskPointerEnter);
      canvas.removeEventListener('pointerleave', onMaskPointerLeave);
      window.removeEventListener('pointermove', onMaskPointerMove);
      window.removeEventListener('pointerup', onMaskPointerUp);
      window.removeEventListener('pointercancel', onMaskPointerUp);
      window.removeEventListener('pointermove', onPointerMove);
      cancelAnimationFrame(animationFrame);
      if (flowGLRef.current) {
        flowGLRef.current.lose?.loseContext();
        flowGLRef.current = null;
        flowGLInitRef.current = false;
      }
    };
  }, [outputHeight, outputWidth]);

  return (
    <>
      <canvas
        ref={canvasRef}
        data-wps-home-bg-canvas
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', cursor: settings.spotMaskEnabled ? 'none' : 'default', touchAction: settings.spotMaskEnabled ? 'none' : 'auto' }}
      />
      <div
        ref={brushPreviewRef}
        style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, borderRadius: '999px', border: '1px solid rgba(255,255,255,0.95)', transform: 'translate(-50%, -50%)', pointerEvents: 'none', opacity: 0, zIndex: 2, boxSizing: 'border-box' }}
      >
        <div
          ref={brushPreviewInnerRef}
          style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, borderRadius: '999px', border: '1px solid rgba(255,255,255,0.55)', transform: 'translate(-50%, -50%)', boxSizing: 'border-box' }}
        />
      </div>
    </>
  );
});
