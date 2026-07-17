import type {
  TransformParams,
  DynamicImageEffect,
  GradientColorStop,
  OutlinesEffect,
  PixelGrainBlendMode,
  PixelGrainEffect,
  SmudgeDistortionEffect,
  SmudgeDistortionStroke,
  TextureDynamicImageAlgorithm,
  TextureEffect,
} from './texture';
import { OUTLINES_MAX_STOPS, clampTransformParamsToSize, isDynamicImageDeformationAlgorithm } from './texture';
import { getOutlinesBlurOffsets } from './outlines';

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
  | { kind: 'texture'; id: string; blendMode: BlendMode; canvas: HTMLCanvasElement | null; frameVersion?: number }
  | { kind: 'effect'; id: string; effect: TextureEffect };

type LegacyWebGLCompositeEffectLayer = {
  kind: 'effect' | 'filter';
  id: string;
  effect?: TextureEffect;
  filter?: TextureEffect;
};

type WebGLCompositeLayerInput =
  | WebGLCompositeLayer
  | LegacyWebGLCompositeEffectLayer;

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

type SourceTextureCacheEntry = {
  texture: WebGLTexture;
  frameVersion: number;
  width: number;
  height: number;
};

type OutlinesGradientUniforms = {
  cols: Float32Array;
  pos: Float32Array;
  alpha: Float32Array;
  count: number;
};

type OutlinesUniformLocations = {
  tex: WebGLUniformLocation | null;
  blurTex: WebGLUniformLocation | null;
  size: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  speed: WebGLUniformLocation | null;
  threshold: WebGLUniformLocation | null;
  count: WebGLUniformLocation | null;
  fieldScale: WebGLUniformLocation | null;
  thickness: WebGLUniformLocation | null;
  spacing: WebGLUniformLocation | null;
  softness: WebGLUniformLocation | null;
  offset: WebGLUniformLocation | null;
  phase: WebGLUniformLocation | null;
  col: WebGLUniformLocation | null;
  pos: WebGLUniformLocation | null;
  alpha: WebGLUniformLocation | null;
  colorCount: WebGLUniformLocation | null;
};

type Renderer = {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  copyProgram: WebGLProgram;
  blendProgram: WebGLProgram;
  smudgeProgram: WebGLProgram | null;
  pixelGrainProgram: WebGLProgram | null;
  dynamicImageEffectProgram: WebGLProgram | null;
  outlinesBlurProgram: WebGLProgram | null;
  outlinesProgram: WebGLProgram | null;
  buffer: WebGLBuffer;
  targets: [FramebufferTarget, FramebufferTarget];
  outlinesBlurTargets: [FramebufferTarget, FramebufferTarget];
  width: number;
  height: number;
  verified: boolean;
  displacementCache: Map<string, DisplacementCache>;
  sourceLayerTextures: Map<string, SourceTextureCacheEntry>;
  outlinesGradientCache: Map<string, OutlinesGradientUniforms>;
  outlinesUniforms: OutlinesUniformLocations | null;
};

const rendererCache = new WeakMap<HTMLCanvasElement, Renderer | null>();
const IS_DEV = import.meta.env.DEV;

const DYNAMIC_IMAGE_ALGORITHM_INDEX = new Map<TextureDynamicImageAlgorithm, number>([
  ['flowDistort', 0],
  ['ripple', 1],
  ['chromaticAberration', 2],
  ['pixelate', 3],
]);

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
uniform float u_zoom;
void main() {
  vec2 sampleUv = (v_uv - 0.5) / max(0.0001, u_zoom) + 0.5;
  gl_FragColor = texture2D(u_tex, sampleUv);
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

float hueToRgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
  if (t < 1.0 / 2.0) return q;
  if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
  return p;
}

vec3 rgbToHsl(vec3 c) {
  float maxC = max(max(c.r, c.g), c.b);
  float minC = min(min(c.r, c.g), c.b);
  float h = 0.0;
  float s = 0.0;
  float l = (maxC + minC) * 0.5;
  if (maxC > minC) {
    float d = maxC - minC;
    s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);
    if (maxC == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    else if (maxC == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h /= 6.0;
  }
  return vec3(h, s, l);
}

vec3 hslToRgb(vec3 hsl) {
  float h = hsl.x;
  float s = hsl.y;
  float l = hsl.z;
  if (s <= 0.0001) return vec3(l);
  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float p = 2.0 * l - q;
  return vec3(
    hueToRgb(p, q, h + 1.0 / 3.0),
    hueToRgb(p, q, h),
    hueToRgb(p, q, h - 1.0 / 3.0)
  );
}

vec3 blendHue(vec3 base, vec3 top) {
  vec3 baseHsl = rgbToHsl(base);
  vec3 topHsl = rgbToHsl(top);
  return hslToRgb(vec3(topHsl.x, baseHsl.y, baseHsl.z));
}

vec3 blendSaturation(vec3 base, vec3 top) {
  vec3 baseHsl = rgbToHsl(base);
  vec3 topHsl = rgbToHsl(top);
  return hslToRgb(vec3(baseHsl.x, topHsl.y, baseHsl.z));
}

vec3 blendColor(vec3 base, vec3 top) {
  vec3 baseHsl = rgbToHsl(base);
  vec3 topHsl = rgbToHsl(top);
  return hslToRgb(vec3(topHsl.x, topHsl.y, baseHsl.z));
}

vec3 blendLuminosity(vec3 base, vec3 top) {
  vec3 baseHsl = rgbToHsl(base);
  vec3 topHsl = rgbToHsl(top);
  return hslToRgb(vec3(baseHsl.x, baseHsl.y, topHsl.z));
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
  else if (u_mode == 12) mixed = blendHue(base, top);
  else if (u_mode == 13) mixed = blendSaturation(base, top);
  else if (u_mode == 14) mixed = blendColor(base, top);
  else if (u_mode == 15) mixed = blendLuminosity(base, top);

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
uniform float u_transformScale;
uniform float u_transformAspect;
uniform vec2 u_transformOffset;
float decode16(vec2 rg) {
  vec2 bytes = floor(rg * 255.0 + 0.5);
  return (bytes.x * 256.0 + bytes.y) / 65535.0;
}
vec2 applyInverseTransform(vec2 uv) {
  vec2 centered = uv - 0.5 - u_transformOffset;
  float scaleX = max(0.0001, u_transformScale);
  float scaleY = max(0.0001, u_transformScale * u_transformAspect);
  return vec2(centered.x / scaleX, centered.y / scaleY) + 0.5;
}
void main() {
  vec2 domainUv = applyInverseTransform(v_uv);
  vec2 dispUv = vec2(domainUv.x, 1.0 - domainUv.y);
  vec4 dispSample = texture2D(u_disp, dispUv);
  vec2 disp = u_dispPacked ? vec2(decode16(dispSample.rg), decode16(dispSample.ba)) : dispSample.rg;
  disp = (disp * 2.0 - 1.0) * u_dispRange;
  vec2 dispUvOffset = vec2(disp.x, -disp.y) * max(u_size.x, u_size.y) / u_size;
  vec2 sampleUv = clamp(domainUv - dispUvOffset, vec2(0.0), vec2(1.0));
  gl_FragColor = texture2D(u_tex, sampleUv);
}`;

const PIXEL_GRAIN_FRAG_SRC = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_size;
uniform float u_amount;
uniform float u_seed;
uniform int u_blendMode;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33 + u_seed * 0.01);
  return fract((p3.x + p3.y) * p3.z);
}

float overlayBlend(float base, float top) {
  return base <= 0.5 ? (2.0 * base * top) : (1.0 - 2.0 * (1.0 - base) * (1.0 - top));
}

float softLightBlend(float base, float top) {
  return top <= 0.5
    ? base - (1.0 - 2.0 * top) * base * (1.0 - base)
    : base + (2.0 * top - 1.0) * (sqrt(max(base, 0.0)) - base);
}

vec3 applyBlend(vec3 base, float top, int mode) {
  if (mode == 3) return base * top;
  if (mode == 2) return 1.0 - (1.0 - base) * (1.0 - top);
  if (mode == 1) return vec3(
    softLightBlend(base.r, top),
    softLightBlend(base.g, top),
    softLightBlend(base.b, top)
  );
  return vec3(
    overlayBlend(base.r, top),
    overlayBlend(base.g, top),
    overlayBlend(base.b, top)
  );
}

void main() {
  vec4 src = texture2D(u_tex, v_uv);
  if (u_amount <= 0.0001 || src.a <= 0.0001) {
    gl_FragColor = src;
    return;
  }
  vec3 base = src.rgb / src.a;
  vec2 pixel = floor(v_uv * u_size);
  float noise = hash(pixel);
  float top = clamp(0.5 + (noise - 0.5) * 0.82, 0.0, 1.0);
  float mixAmount = u_amount * src.a;
  vec3 blended = applyBlend(base, top, u_blendMode);
  vec3 outBase = mix(base, blended, mixAmount);
  gl_FragColor = vec4(outBase * src.a, src.a);
}`;

const DYNAMIC_IMAGE_EFFECT_FRAG_SRC = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_size;
uniform float u_time;
uniform float u_speed;
uniform float u_strength;
uniform float u_paramA;
uniform float u_paramB;
uniform float u_opacity;
uniform int u_algo;
uniform float u_transformScale;
uniform float u_transformAspect;
uniform vec2 u_transformOffset;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec4 sampleSource(vec2 uv) {
  return texture2D(u_tex, clamp(uv, vec2(0.0), vec2(1.0)));
}

vec2 applyInverseTransform(vec2 uv) {
  vec2 centered = uv - 0.5 - u_transformOffset;
  float scaleX = max(0.0001, u_transformScale);
  float scaleY = max(0.0001, u_transformScale * u_transformAspect);
  return vec2(centered.x / scaleX, centered.y / scaleY) + 0.5;
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
  vec2 domainUv = applyInverseTransform(v_uv);
  vec4 baseColor = sampleSource(domainUv);
  float t = u_time * max(0.01, u_speed);
  vec4 effectColor;
  if (u_algo == 0) effectColor = sampleSource(applyFlow(domainUv, t));
  else if (u_algo == 1) effectColor = sampleSource(applyRipple(domainUv, t));
  else if (u_algo == 2) effectColor = applyChromatic(domainUv, t);
  else effectColor = mix(baseColor, applyPixelate(domainUv), clamp(u_strength, 0.0, 1.0));
  float mixAmount = clamp(u_opacity, 0.0, 1.0);
  gl_FragColor = mix(baseColor, effectColor, mixAmount);
}`;

const OUTLINES_BLUR_FRAG_SRC = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_size;
uniform int u_inputMode;
uniform int u_firstPass;
uniform float u_offset;

float sampleField(vec4 src, int mode) {
  float alpha = max(src.a, 0.0001);
  vec3 base = src.rgb / alpha;
  float luma = dot(base, vec3(0.299, 0.587, 0.114));
  if (mode == 2) return src.a;
  if (mode == 1) return 1.0 - luma;
  return luma;
}

float readField(vec2 uv) {
  vec4 src = texture2D(u_tex, uv);
  if (u_firstPass == 1) {
    return sampleField(src, u_inputMode);
  }
  return src.r;
}

void main() {
  vec2 delta = vec2(
    u_offset / max(1.0, u_size.x),
    u_offset / max(1.0, u_size.y)
  );
  float field = (
    readField(v_uv + vec2(-delta.x, -delta.y))
    + readField(v_uv + vec2(delta.x, -delta.y))
    + readField(v_uv + vec2(-delta.x, delta.y))
    + readField(v_uv + vec2(delta.x, delta.y))
  ) * 0.25;
  gl_FragColor = vec4(field, field, field, 1.0);
}`;

const OUTLINES_FRAG_SRC = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform sampler2D u_blurTex;
uniform vec2 u_size;
uniform float u_time;
uniform float u_speed;
uniform float u_threshold;
uniform float u_count;
uniform float u_fieldScale;
uniform float u_thickness;
uniform float u_spacing;
uniform float u_softness;
uniform float u_offset;
uniform float u_phase;
uniform vec3 u_col[${OUTLINES_MAX_STOPS}];
uniform float u_pos[${OUTLINES_MAX_STOPS}];
uniform float u_alpha[${OUTLINES_MAX_STOPS}];
uniform int u_colorCount;

float smoothCurve(float t) {
  return t * t * (3.0 - 2.0 * t);
}

vec4 ramp(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 color = u_col[0];
  float alpha = u_alpha[0];
  for (int i = 0; i < ${OUTLINES_MAX_STOPS - 1}; i++) {
    if (i + 1 <= u_colorCount - 1) {
      float seg = clamp((t - u_pos[i]) / max(0.0001, u_pos[i + 1] - u_pos[i]), 0.0, 1.0);
      seg = smoothCurve(seg);
      float on = step(u_pos[i], t);
      color = mix(color, mix(u_col[i], u_col[i + 1], seg), on);
      alpha = mix(alpha, mix(u_alpha[i], u_alpha[i + 1], seg), on);
    }
  }
  return vec4(color, alpha);
}

void main() {
  vec4 src = texture2D(u_tex, v_uv);
  if (src.a <= 0.0001) {
    gl_FragColor = src;
    return;
  }
  float field = texture2D(u_blurTex, v_uv).r;
  float contrast = 1.0 + clamp(u_fieldScale, 0.0, 1.0) * 2.0;
  float frequency = max(1.0, u_count) / max(0.2, u_spacing);
  float shifted = (field - u_threshold) * contrast;
  float colorT = clamp(0.5 + shifted + u_offset * 0.5, 0.0, 1.0);
  float phase = u_phase + u_offset + u_time * max(0.0, u_speed);
  float v = shifted * frequency + phase;
  float cycle = fract(v);
  float distCycle = abs(cycle - 0.5);
  float grad = max(fwidth(v), 0.0001);
  float distPx = distCycle / grad;
  float halfPx = max(0.25, u_thickness * 0.5);
  float softPx = 0.5 + clamp(u_softness, 0.0, 1.0) * 0.75;
  float line = 1.0 - smoothstep(max(0.0, halfPx - softPx * 0.5), halfPx + softPx * 0.5, distPx);
  float amount = line * src.a;
  vec3 base = src.rgb / src.a;
  vec4 lineColor = ramp(colorT);
  vec3 outBase = mix(base, lineColor.rgb, amount * lineColor.a);
  gl_FragColor = vec4(outBase * src.a, src.a);
}`;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseHexRgb(hex: string) {
  const safeHex = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#ffffff';
  const value = Number.parseInt(safeHex.slice(1), 16);
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
  };
}

function buildOutlinesGradientUniforms(stops: GradientColorStop[]): OutlinesGradientUniforms {
  const safeStops = (stops.length >= 2 ? stops : [
    { position: 0, color: '#ffffff', opacity: 1 },
    { position: 1, color: '#ffffff', opacity: 1 },
  ]).slice(0, OUTLINES_MAX_STOPS);
  const cols = new Float32Array(OUTLINES_MAX_STOPS * 3);
  const pos = new Float32Array(OUTLINES_MAX_STOPS);
  const alpha = new Float32Array(OUTLINES_MAX_STOPS);
  for (let i = 0; i < safeStops.length; i += 1) {
    const stop = safeStops[i];
    const rgb = parseHexRgb(stop.color);
    cols[i * 3] = rgb.r;
    cols[i * 3 + 1] = rgb.g;
    cols[i * 3 + 2] = rgb.b;
    pos[i] = clamp(stop.position, 0, 1);
    alpha[i] = clamp(stop.opacity, 0, 1);
  }
  if (safeStops.length >= 1) {
    const fillPos = safeStops[safeStops.length - 1].position;
    const fillAlpha = safeStops[safeStops.length - 1].opacity;
    const fillRgb = parseHexRgb(safeStops[safeStops.length - 1].color);
    for (let i = safeStops.length; i < OUTLINES_MAX_STOPS; i += 1) {
      cols[i * 3] = fillRgb.r;
      cols[i * 3 + 1] = fillRgb.g;
      cols[i * 3 + 2] = fillRgb.b;
      pos[i] = fillPos;
      alpha[i] = fillAlpha;
    }
  }
  return { cols, pos, alpha, count: safeStops.length };
}

function outlinesGradientCacheKey(stops: GradientColorStop[]) {
  if (stops.length === 0) return 'empty';
  return stops
    .slice(0, OUTLINES_MAX_STOPS)
    .map(stop => `${clamp(stop.position, 0, 1).toFixed(4)}:${stop.color}:${clamp(stop.opacity, 0, 1).toFixed(4)}`)
    .join('|');
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
    preserveDrawingBuffer: false,
  });
  if (!gl) {
    rendererCache.set(canvas, null);
    return null;
  }
  const copyProgram = createProgram(gl, COPY_FRAG_SRC);
  const blendProgram = createProgram(gl, BLEND_FRAG_SRC);
  const smudgeProgram = createProgram(gl, SMUDGE_FRAG_SRC);
  const pixelGrainProgram = createProgram(gl, PIXEL_GRAIN_FRAG_SRC);
  const dynamicImageEffectProgram = createProgram(gl, DYNAMIC_IMAGE_EFFECT_FRAG_SRC);
  const outlinesBlurProgram = createProgram(gl, OUTLINES_BLUR_FRAG_SRC);
  const outlinesProgram = createProgram(gl, OUTLINES_FRAG_SRC);
  const buffer = gl.createBuffer();
  const targetA = createTarget(gl, 1, 1);
  const targetB = createTarget(gl, 1, 1);
  const outlinesBlurTargetA = createTarget(gl, 1, 1);
  const outlinesBlurTargetB = createTarget(gl, 1, 1);
  if (!copyProgram || !blendProgram || !buffer || !targetA || !targetB || !outlinesBlurTargetA || !outlinesBlurTargetB) {
    rendererCache.set(canvas, null);
    return null;
  }
  const outlinesUniforms: OutlinesUniformLocations | null = outlinesProgram
    ? {
      tex: gl.getUniformLocation(outlinesProgram, 'u_tex'),
      blurTex: gl.getUniformLocation(outlinesProgram, 'u_blurTex'),
      size: gl.getUniformLocation(outlinesProgram, 'u_size'),
      time: gl.getUniformLocation(outlinesProgram, 'u_time'),
      speed: gl.getUniformLocation(outlinesProgram, 'u_speed'),
      threshold: gl.getUniformLocation(outlinesProgram, 'u_threshold'),
      count: gl.getUniformLocation(outlinesProgram, 'u_count'),
      fieldScale: gl.getUniformLocation(outlinesProgram, 'u_fieldScale'),
      thickness: gl.getUniformLocation(outlinesProgram, 'u_thickness'),
      spacing: gl.getUniformLocation(outlinesProgram, 'u_spacing'),
      softness: gl.getUniformLocation(outlinesProgram, 'u_softness'),
      offset: gl.getUniformLocation(outlinesProgram, 'u_offset'),
      phase: gl.getUniformLocation(outlinesProgram, 'u_phase'),
      col: gl.getUniformLocation(outlinesProgram, 'u_col[0]'),
      pos: gl.getUniformLocation(outlinesProgram, 'u_pos[0]'),
      alpha: gl.getUniformLocation(outlinesProgram, 'u_alpha[0]'),
      colorCount: gl.getUniformLocation(outlinesProgram, 'u_colorCount'),
    }
    : null;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const renderer: Renderer = {
    canvas: renderCanvas,
    gl,
    copyProgram,
    blendProgram,
    smudgeProgram,
    pixelGrainProgram,
    dynamicImageEffectProgram,
    outlinesBlurProgram,
    outlinesProgram,
    buffer,
    targets: [targetA, targetB],
    outlinesBlurTargets: [outlinesBlurTargetA, outlinesBlurTargetB],
    width: 1,
    height: 1,
    verified: false,
    displacementCache: new Map(),
    sourceLayerTextures: new Map(),
    outlinesGradientCache: new Map(),
    outlinesUniforms,
  };
  rendererCache.set(canvas, renderer);
  return renderer;
}

function ensureTargetSize(renderer: Renderer, width: number, height: number) {
  if (renderer.width === width && renderer.height === height) return true;
  renderer.verified = false;
  renderer.canvas.width = width;
  renderer.canvas.height = height;
  const { gl } = renderer;
  for (const target of [...renderer.targets, ...renderer.outlinesBlurTargets]) {
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

function drawCopy(
  renderer: Renderer,
  input: WebGLTexture,
  output: WebGLFramebuffer | null,
  width: number,
  height: number,
  zoom: number = 1,
) {
  const { gl, copyProgram } = renderer;
  gl.bindFramebuffer(gl.FRAMEBUFFER, output);
  gl.viewport(0, 0, width, height);
  bindFullscreen(gl, renderer, copyProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, input);
  gl.uniform1i(gl.getUniformLocation(copyProgram, 'u_tex'), 0);
  gl.uniform1f(gl.getUniformLocation(copyProgram, 'u_zoom'), clamp(zoom, 1, 4));
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function uploadCanvas(renderer: Renderer, layerId: string, canvas: HTMLCanvasElement, frameVersion: number) {
  const { gl } = renderer;
  let cached = renderer.sourceLayerTextures.get(layerId);
  if (!cached) {
    const texture = createTexture(gl);
    if (!texture) return null;
    cached = {
      texture,
      frameVersion: -1,
      width: 0,
      height: 0,
    };
    renderer.sourceLayerTextures.set(layerId, cached);
  }
  gl.bindTexture(gl.TEXTURE_2D, cached.texture);
  if (cached.frameVersion === frameVersion && cached.width === canvas.width && cached.height === canvas.height) {
    return cached.texture;
  }
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  cached.frameVersion = frameVersion;
  cached.width = canvas.width;
  cached.height = canvas.height;
  return cached.texture;
}

function hasVisiblePixels(
  gl: WebGLRenderingContext,
  width: number,
  height: number,
  framebuffer: WebGLFramebuffer | null = null,
) {
  const samples = [
    [0.5, 0.5],
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75],
  ];
  const pixel = new Uint8Array(4);
  const prevFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  for (const [sx, sy] of samples) {
    const x = clamp(Math.floor(width * sx), 0, width - 1);
    const y = clamp(Math.floor(height * sy), 0, height - 1);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    if (gl.getError() !== gl.NO_ERROR) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, prevFramebuffer);
      return false;
    }
    if (pixel[3] > 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, prevFramebuffer);
      return true;
    }
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, prevFramebuffer);
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
  if (mode === 'hue') return 12;
  if (mode === 'saturation') return 13;
  if (mode === 'color') return 14;
  if (mode === 'luminosity') return 15;
  return null;
}

function pixelGrainBlendToUniform(mode: PixelGrainBlendMode) {
  if (mode === 'softLight') return 1;
  if (mode === 'screen') return 2;
  if (mode === 'multiply') return 3;
  return 0;
}

function dynamicImageAlgorithmToUniform(algorithm: TextureDynamicImageAlgorithm) {
  return DYNAMIC_IMAGE_ALGORITHM_INDEX.get(algorithm) ?? 0;
}

function needsDynamicImageEdgeSafeZoom(algorithm: TextureDynamicImageAlgorithm) {
  return algorithm === 'flowDistort' || algorithm === 'ripple' || algorithm === 'chromaticAberration';
}

function normalizeDynamicImageParams(effect: DynamicImageEffect): { paramA: number; paramB: number } {
  const toUnit = (value: number, min: number, max: number) => {
    if (max <= min) return 0;
    return clamp((value - min) / (max - min), 0, 1);
  };
  if (effect.algorithm === 'flowDistort') {
    return {
      paramA: toUnit(effect.paramA, 0.05, 2),
      paramB: toUnit(effect.paramB, 0.05, 2.5),
    };
  }
  if (effect.algorithm === 'ripple') {
    return {
      paramA: toUnit(effect.paramA, 0.1, 2.5),
      paramB: toUnit(effect.paramB, 0.05, 1),
    };
  }
  if (effect.algorithm === 'chromaticAberration') {
    return {
      paramA: toUnit(effect.paramA, 0.05, 1),
      paramB: toUnit(effect.paramB, 0, 1),
    };
  }
  return {
    paramA: effect.paramA,
    paramB: clamp(effect.paramB, 0, 1),
  };
}

function getEffectTransformUniforms(transform: TransformParams | undefined, width: number, height: number) {
  const clamped = clampTransformParamsToSize(transform ?? { scale: 1, aspectRatio: 1, offsetX: 0, offsetY: 0 }, width, height);
  return {
    scale: clamped.scale,
    aspectRatio: clamped.aspectRatio,
    offsetX: clamp(clamped.offsetX / Math.max(1, width), -1, 1),
    offsetY: clamp(clamped.offsetY / Math.max(1, height), -1, 1),
  };
}

function mapPointByInverseTransform(
  x: number,
  y: number,
  width: number,
  height: number,
  transform: TransformParams | undefined,
) {
  const t = clampTransformParamsToSize(transform ?? { scale: 1, aspectRatio: 1, offsetX: 0, offsetY: 0 }, width, height);
  const nx = x - 0.5 - t.offsetX / Math.max(1, width);
  const ny = y - 0.5 - t.offsetY / Math.max(1, height);
  return {
    x: nx / Math.max(0.0001, t.scale) + 0.5,
    y: ny / Math.max(0.0001, t.scale * t.aspectRatio) + 0.5,
  };
}

function smudgeKey(effect: SmudgeDistortionEffect, width: number, height: number) {
  const t = getEffectTransformUniforms(effect.transform, width, height);
  return `${width}x${height}:${effect.strength}:${effect.precision}:${t.scale.toFixed(4)}:${t.aspectRatio.toFixed(4)}:${t.offsetX.toFixed(4)}:${t.offsetY.toFixed(4)}:${effect.strokes.map(stroke => (
    `${stroke.brushSize},${stroke.brushStrength},${stroke.brushFeather}:` +
    stroke.points.map(point => `${point.x.toFixed(4)},${point.y.toFixed(4)}`).join(';')
  )).join('|')}`;
}

function addStrokeToField(
  stroke: SmudgeDistortionStroke,
  transform: TransformParams | undefined,
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
    const prevMapped = mapPointByInverseTransform(prev.x, prev.y, width, height, transform);
    const nextMapped = mapPointByInverseTransform(next.x, next.y, width, height, transform);
    const px = prevMapped.x * fieldWidth;
    const py = prevMapped.y * fieldHeight;
    const nx = nextMapped.x * fieldWidth;
    const ny = nextMapped.y * fieldHeight;
    const moveX = nx - px;
    const moveY = ny - py;
    const sourceMoveX = (nextMapped.x - prevMapped.x) * width;
    const sourceMoveY = (nextMapped.y - prevMapped.y) * height;
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

function getDisplacementTexture(renderer: Renderer, filterId: string, effect: SmudgeDistortionEffect, width: number, height: number) {
  const key = smudgeKey(effect, width, height);
  const cached = renderer.displacementCache.get(filterId);
  if (cached && cached.key === key) return cached;

  const { gl } = renderer;
  const texture = cached?.texture ?? createTexture(gl);
  if (!texture) return null;
  const supportsFloatDisplacement = Boolean(gl.getExtension('OES_texture_float') && gl.getExtension('OES_texture_float_linear'));
  const precision = Math.max(1, Math.min(4, Math.round(effect.precision)));
  const fieldWidth = width * precision;
  const fieldHeight = height * precision;
  const fieldSize = fieldWidth * fieldHeight;
  const dxField = new Float32Array(fieldSize);
  const dyField = new Float32Array(fieldSize);
  for (const stroke of effect.strokes) {
    addStrokeToField(stroke, effect.transform, effect.strength, width, height, precision, dxField, dyField);
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
  effect: SmudgeDistortionEffect,
  output: WebGLFramebuffer,
  width: number,
  height: number,
) {
  const { gl, smudgeProgram } = renderer;
  if (!smudgeProgram) return false;
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
  const transform = getEffectTransformUniforms(effect.transform, width, height);
  gl.uniform1f(gl.getUniformLocation(smudgeProgram, 'u_transformScale'), transform.scale);
  gl.uniform1f(gl.getUniformLocation(smudgeProgram, 'u_transformAspect'), transform.aspectRatio);
  gl.uniform2f(gl.getUniformLocation(smudgeProgram, 'u_transformOffset'), transform.offsetX, transform.offsetY);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  return true;
}

function drawPixelGrain(
  renderer: Renderer,
  input: WebGLTexture,
  effect: PixelGrainEffect,
  output: WebGLFramebuffer,
  width: number,
  height: number,
) {
  const { gl, pixelGrainProgram } = renderer;
  if (!pixelGrainProgram) return false;
  gl.bindFramebuffer(gl.FRAMEBUFFER, output);
  gl.viewport(0, 0, width, height);
  bindFullscreen(gl, renderer, pixelGrainProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, input);
  gl.uniform1i(gl.getUniformLocation(pixelGrainProgram, 'u_tex'), 0);
  gl.uniform2f(gl.getUniformLocation(pixelGrainProgram, 'u_size'), width, height);
  gl.uniform1f(gl.getUniformLocation(pixelGrainProgram, 'u_amount'), clamp(effect.amount, 0, 1));
  gl.uniform1f(gl.getUniformLocation(pixelGrainProgram, 'u_seed'), effect.seed);
  gl.uniform1i(gl.getUniformLocation(pixelGrainProgram, 'u_blendMode'), pixelGrainBlendToUniform(effect.blendMode));
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  return true;
}

function drawDynamicImageEffect(
  renderer: Renderer,
  input: WebGLTexture,
  effect: DynamicImageEffect,
  output: WebGLFramebuffer,
  width: number,
  height: number,
  timeSec: number,
) {
  const { gl, dynamicImageEffectProgram } = renderer;
  if (!dynamicImageEffectProgram) return false;
  const normalized = normalizeDynamicImageParams(effect);
  const transform = isDynamicImageDeformationAlgorithm(effect.algorithm)
    ? getEffectTransformUniforms(effect.transform, width, height)
    : getEffectTransformUniforms(undefined, width, height);
  gl.bindFramebuffer(gl.FRAMEBUFFER, output);
  gl.viewport(0, 0, width, height);
  bindFullscreen(gl, renderer, dynamicImageEffectProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, input);
  gl.uniform1i(gl.getUniformLocation(dynamicImageEffectProgram, 'u_tex'), 0);
  gl.uniform2f(gl.getUniformLocation(dynamicImageEffectProgram, 'u_size'), width, height);
  gl.uniform1f(gl.getUniformLocation(dynamicImageEffectProgram, 'u_time'), timeSec);
  gl.uniform1f(gl.getUniformLocation(dynamicImageEffectProgram, 'u_speed'), clamp(effect.speed, 0.01, 3));
  gl.uniform1f(gl.getUniformLocation(dynamicImageEffectProgram, 'u_strength'), clamp(effect.strength, 0, 1));
  gl.uniform1f(gl.getUniformLocation(dynamicImageEffectProgram, 'u_paramA'), normalized.paramA);
  gl.uniform1f(gl.getUniformLocation(dynamicImageEffectProgram, 'u_paramB'), normalized.paramB);
  gl.uniform1f(gl.getUniformLocation(dynamicImageEffectProgram, 'u_opacity'), clamp(effect.opacity, 0, 1));
  gl.uniform1i(gl.getUniformLocation(dynamicImageEffectProgram, 'u_algo'), dynamicImageAlgorithmToUniform(effect.algorithm));
  gl.uniform1f(gl.getUniformLocation(dynamicImageEffectProgram, 'u_transformScale'), transform.scale);
  gl.uniform1f(gl.getUniformLocation(dynamicImageEffectProgram, 'u_transformAspect'), transform.aspectRatio);
  gl.uniform2f(gl.getUniformLocation(dynamicImageEffectProgram, 'u_transformOffset'), transform.offsetX, transform.offsetY);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  return true;
}

function outlinesInputToUniform(mode: OutlinesEffect['inputMode']) {
  if (mode === 'inverseLuma') return 1;
  if (mode === 'alpha') return 2;
  return 0;
}

function drawOutlinesBlur(
  renderer: Renderer,
  input: WebGLTexture,
  effect: OutlinesEffect,
  width: number,
  height: number,
) {
  const { gl, outlinesBlurProgram, outlinesBlurTargets } = renderer;
  if (!outlinesBlurProgram) return null;
  const calculatedOffsets = getOutlinesBlurOffsets(effect.smoothing, effect.gaussianSamples);
  const offsets = calculatedOffsets[0] === 0 ? [0] : calculatedOffsets;
  let source = input;
  for (let index = 0; index < offsets.length; index += 1) {
    const target = outlinesBlurTargets[index % outlinesBlurTargets.length];
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, width, height);
    bindFullscreen(gl, renderer, outlinesBlurProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(gl.getUniformLocation(outlinesBlurProgram, 'u_tex'), 0);
    gl.uniform2f(gl.getUniformLocation(outlinesBlurProgram, 'u_size'), width, height);
    gl.uniform1i(gl.getUniformLocation(outlinesBlurProgram, 'u_inputMode'), outlinesInputToUniform(effect.inputMode));
    gl.uniform1i(gl.getUniformLocation(outlinesBlurProgram, 'u_firstPass'), index === 0 ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(outlinesBlurProgram, 'u_offset'), offsets[index]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    source = target.texture;
  }
  return source;
}

function drawOutlines(
  renderer: Renderer,
  input: WebGLTexture,
  effect: OutlinesEffect,
  output: WebGLFramebuffer,
  width: number,
  height: number,
  timeSec: number,
) {
  const { gl, outlinesProgram, outlinesUniforms } = renderer;
  if (!outlinesProgram || !outlinesUniforms) return false;
  const blurTexture = drawOutlinesBlur(renderer, input, effect, width, height);
  if (!blurTexture) return false;
  const gradientKey = outlinesGradientCacheKey(effect.lineGradientStops);
  let gradientUniforms = renderer.outlinesGradientCache.get(gradientKey);
  if (!gradientUniforms) {
    gradientUniforms = buildOutlinesGradientUniforms(effect.lineGradientStops);
    renderer.outlinesGradientCache.set(gradientKey, gradientUniforms);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, output);
  gl.viewport(0, 0, width, height);
  bindFullscreen(gl, renderer, outlinesProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, input);
  gl.uniform1i(outlinesUniforms.tex, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, blurTexture);
  gl.uniform1i(outlinesUniforms.blurTex, 1);
  gl.uniform2f(outlinesUniforms.size, width, height);
  gl.uniform1f(outlinesUniforms.time, timeSec);
  gl.uniform1f(outlinesUniforms.speed, effect.animationEnabled ? clamp(effect.speed, 0, 3) : 0);
  gl.uniform1f(outlinesUniforms.threshold, clamp(effect.threshold, 0, 1));
  gl.uniform1f(outlinesUniforms.count, Math.round(clamp(effect.count, 1, 48)));
  gl.uniform1f(outlinesUniforms.fieldScale, clamp(effect.fieldScale, 0, 1));
  gl.uniform1f(outlinesUniforms.thickness, clamp(effect.thickness, 0.5, 8));
  gl.uniform1f(outlinesUniforms.spacing, clamp(effect.spacing, 0.2, 8));
  gl.uniform1f(outlinesUniforms.softness, clamp(effect.softness, 0, 1));
  gl.uniform1f(outlinesUniforms.offset, clamp(effect.offset, -1, 1));
  gl.uniform1f(outlinesUniforms.phase, effect.phase);
  gl.uniform3fv(outlinesUniforms.col, gradientUniforms.cols);
  gl.uniform1fv(outlinesUniforms.pos, gradientUniforms.pos);
  gl.uniform1fv(outlinesUniforms.alpha, gradientUniforms.alpha);
  gl.uniform1i(outlinesUniforms.colorCount, gradientUniforms.count);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  return true;
}

function normalizeCompositeLayer(layer: WebGLCompositeLayerInput): WebGLCompositeLayer | null {
  if (layer.kind === 'texture') return layer;
  const effect = layer.effect ?? ('filter' in layer ? layer.filter : undefined);
  if (!effect) return null;
  return {
    kind: 'effect',
    id: layer.id,
    effect,
  };
}

export function drawLayerStackWebGL(
  output: HTMLCanvasElement,
  layers: WebGLCompositeLayerInput[],
  width: number,
  height: number,
  timeSec: number = performance.now() * 0.001,
) {
  try {
    const normalizedLayers = layers
      .map(normalizeCompositeLayer)
      .filter((layer): layer is WebGLCompositeLayer => layer !== null);
    const renderer = getRenderer(output);
    if (!renderer || width <= 0 || height <= 0) {
      if (IS_DEV) console.warn('WebGL composite fallback: renderer unavailable or invalid canvas size.');
      return false;
    }
    const hasActivePaintMask = normalizedLayers.some(layer => (
      layer.kind === 'effect'
      && layer.effect.type === 'paintMask'
      && layer.effect.enabled
      && layer.effect.strokes.length > 0
    ));
    if (hasActivePaintMask) {
      if (IS_DEV) console.warn('WebGL composite fallback: active paint mask requires Canvas 2D pass.');
      return false;
    }
    const unsupportedBlendLayer = layers.find(
      layer => layer.kind === 'texture' && blendModeToUniform(layer.blendMode) === null,
    );
    if (unsupportedBlendLayer && unsupportedBlendLayer.kind === 'texture') {
      if (IS_DEV) console.warn(`WebGL composite fallback: unsupported blend mode "${unsupportedBlendLayer.blendMode}".`);
      return false;
    }
    if (!ensureTargetSize(renderer, width, height)) {
      if (IS_DEV) console.warn('WebGL composite fallback: framebuffer resize/validation failed.');
      return false;
    }

    const { gl, targets } = renderer;
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, targets[0].framebuffer);
    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, targets[1].framebuffer);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const drawOrder = [...normalizedLayers].reverse();
    const activeTextureIds = new Set<string>();
    let currentTarget = 0;
    let scratchTarget = 1;
    let hasDrawnLayer = false;

    for (const layer of drawOrder) {
      if (layer.kind === 'texture') {
        if (!layer.canvas || layer.canvas.width <= 0 || layer.canvas.height <= 0) continue;
        activeTextureIds.add(layer.id);
        const srcTexture = uploadCanvas(renderer, layer.id, layer.canvas, layer.frameVersion ?? 0);
        if (!srcTexture) {
          if (IS_DEV) console.warn(`WebGL composite fallback: failed to upload texture layer "${layer.id}".`);
          return false;
        }
        if (!hasDrawnLayer) {
          drawCopy(renderer, srcTexture, targets[currentTarget].framebuffer, width, height);
          hasDrawnLayer = true;
          continue;
        }
        const mode = blendModeToUniform(layer.blendMode);
        if (mode === null) {
          if (IS_DEV) console.warn(`WebGL composite fallback: blend mode "${layer.blendMode}" missing uniform mapping.`);
          return false;
        }
        drawBlend(renderer, targets[currentTarget].texture, srcTexture, targets[scratchTarget].framebuffer, mode, width, height);
        [currentTarget, scratchTarget] = [scratchTarget, currentTarget];
        continue;
      }

      if (
        !hasDrawnLayer ||
        !layer.effect.enabled
      ) continue;
      if (layer.effect.type === 'smudgeDistortion') {
        if (layer.effect.strength <= 0 || layer.effect.strokes.length === 0) continue;
        const displacement = getDisplacementTexture(renderer, layer.id, layer.effect, width, height);
        if (!displacement) {
          if (IS_DEV) console.warn('WebGL composite fallback: failed to build smudge displacement texture.');
          return false;
        }
        if (!drawSmudge(renderer, targets[currentTarget].texture, displacement.texture, displacement.range, displacement.packed, layer.effect, targets[scratchTarget].framebuffer, width, height)) {
          if (IS_DEV) console.warn('WebGL composite fallback: smudge program unavailable.');
          return false;
        }
        [currentTarget, scratchTarget] = [scratchTarget, currentTarget];
        continue;
      }
      if (layer.effect.type === 'pixelGrain') {
        if (layer.effect.amount <= 0) continue;
        if (!drawPixelGrain(renderer, targets[currentTarget].texture, layer.effect, targets[scratchTarget].framebuffer, width, height)) {
          if (IS_DEV) console.warn('WebGL composite fallback: pixel grain program unavailable.');
          return false;
        }
        [currentTarget, scratchTarget] = [scratchTarget, currentTarget];
        continue;
      }
      if (layer.effect.type === 'dynamicImageEffect') {
        if (layer.effect.strength <= 0 || layer.effect.opacity <= 0) continue;
        if (needsDynamicImageEdgeSafeZoom(layer.effect.algorithm)) {
          drawCopy(renderer, targets[currentTarget].texture, targets[scratchTarget].framebuffer, width, height, 1.02);
          if (!drawDynamicImageEffect(renderer, targets[scratchTarget].texture, layer.effect, targets[currentTarget].framebuffer, width, height, timeSec)) {
            if (IS_DEV) console.warn('WebGL composite fallback: dynamic image effect program unavailable.');
            return false;
          }
          continue;
        }
        if (!drawDynamicImageEffect(renderer, targets[currentTarget].texture, layer.effect, targets[scratchTarget].framebuffer, width, height, timeSec)) {
          if (IS_DEV) console.warn('WebGL composite fallback: dynamic image effect program unavailable.');
          return false;
        }
        [currentTarget, scratchTarget] = [scratchTarget, currentTarget];
        continue;
      }
      if (layer.effect.type === 'outlines') {
        if (layer.effect.count <= 0 || layer.effect.thickness <= 0) continue;
        if (!drawOutlines(renderer, targets[currentTarget].texture, layer.effect, targets[scratchTarget].framebuffer, width, height, timeSec)) {
          if (IS_DEV) console.warn('WebGL composite fallback: outlines program unavailable.');
          return false;
        }
        [currentTarget, scratchTarget] = [scratchTarget, currentTarget];
      }
    }
    for (const [layerId, entry] of renderer.sourceLayerTextures.entries()) {
      if (activeTextureIds.has(layerId)) continue;
      gl.deleteTexture(entry.texture);
      renderer.sourceLayerTextures.delete(layerId);
    }

    if (!hasDrawnLayer) {
      if (IS_DEV) console.warn('WebGL composite fallback: no drawable texture layer found.');
      return false;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    drawCopy(renderer, targets[currentTarget].texture, null, width, height);
    // The finish + readback probe only guards against drivers that silently
    // render nothing. It forces a synchronous GPU stall, so run it once per
    // renderer/size instead of every animation frame.
    if (!renderer.verified) {
      gl.finish();
      if (!hasVisiblePixels(gl, width, height, targets[currentTarget].framebuffer) && IS_DEV) {
        console.warn('WebGL composite probe reported empty frame; keeping WebGL path to avoid false 2D fallback.');
      }
      renderer.verified = true;
    }

    const outputCtx = output.getContext('2d');
    if (!outputCtx) {
      if (IS_DEV) console.warn('WebGL composite fallback: 2D context unavailable for final blit.');
      return false;
    }
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
