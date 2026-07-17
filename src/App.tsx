import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent as ReactChangeEvent,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ColorInput } from './components/ColorInput';
import { DynamicTextureCanvas, type DynamicTextureCanvasHandle } from './components/DynamicTextureCanvas';
import { drawLayerStackWebGL, type WebGLCompositeLayer } from './webglComposite';
import { loadDynamicImageFile, releaseDynamicImageAsset, type DynamicImageAsset } from './dynamicImage';
import { createDynamicImageGL, renderDynamicImageGL, type DynamicImageGLState } from './dynamicImageWebGL';
import { getOutlinesBlurOffsets } from './outlines';
import eyeIcon from './assets/eye.svg';
import eyeClosedIcon from './assets/eye_close.svg';
import {
  DYNAMIC_IMAGE_ALGORITHM_VALUES,
  DYNAMIC_IMAGE_DEFORMATION_ALGORITHMS,
  DYNAMIC_IMAGE_ALGORITHM_GROUPS,
  GRADIENT_ALGO_TRANSFORM_PARAM_BOUNDS,
  GRADIENT_ALGO_TRANSFORM_PARAM_DEFS,
  GRADIENT_ALGORITHM_GROUPS,
  OUTLINES_DEFAULT_LINE_GRADIENT,
  TRANSFORM_PARAM_BOUNDS_DEFAULT,
  TRANSFORM_PARAM_DEFS,
  TRANSFORM_PARAMS_DEFAULTS,
  TEXTURE_DEFAULTS,
  clampTransformParamsToSize,
  getDynamicImageAlgorithmDef,
  sanitizeDynamicImageEffect,
  sanitizeOutlinesEffect,
  sanitizeTransformParams,
  isDefaultTransformParams,
  isDynamicImageDeformationAlgorithm,
  getGradientAlgorithmDef,
  getTextureDefaults,
  isGradientAlgorithm,
  sanitizePixelGrainEffect,
  sanitizePaintMaskEffect,
  readPresetFile,
  sanitizeSmudgeDistortionEffect,
  sanitizeTextureEffect,
  sanitizeTextureSettings,
  writePresetFile,
  type DynamicImageEffect,
  type GradientColorStop,
  type PixelGrainBlendMode,
  type PixelGrainEffect,
  type PaintMaskEffect,
  type OutlinesEffect,
  type OutlinesInputMode,
  type PaintMaskStroke,
  type SmudgeDistortionEffect,
  type SmudgeDistortionPoint,
  type SmudgeDistortionStroke,
  type TextureActivationType,
  type TextureAnimType,
  type TextureDynamicImageAlgorithm,
  type TextureEffect,
  type TransformParamKey,
  type TransformParams,
  type TextureGradientAlgorithm,
  type TextureGradientAnimType,
  type TextureMaskBrush,
  type TexturePreset,
  type TextureSettings,
  type TextureSpotType,
  type TextureType,
  type TextureTileType,
} from './texture';

type NumberKey = Extract<keyof TextureSettings,
  'speed' | 'directionDeg' | 'coherence' | 'spotCount' | 'spotSize' | 'spotBlur' | 'spotScale' | 'spotOffsetX' | 'spotOffsetY' | 'randomness' |
  'spotMaskBrushSize' | 'spotMaskBrushOpacity' | 'spotMaskFeather' |
  'dotOpacity' | 'dotSpacing' | 'dotMinSize' | 'dotMaxSize' | 'dotYOffsetMap' | 'dotTurbulenceStrength' | 'dotTurbulenceSmoothness' | 'dotTurbulenceSeed' | 'contrast' | 'threshold' |
  'fadeEdgeTop' | 'fadeEdgeBottom' | 'fadeEdgeLeft' | 'fadeEdgeRight' | 'seed' |
  'mouseInteractionRadius' | 'mouseInteractionInitialSpeed' | 'mouseInteractionFinalSpeed' | 'mouseInteractionDuration' | 'mouseInteractionArea' |
  'activationOffsetX' | 'activationOffsetY' | 'activationRadiusX' | 'activationRadiusY' | 'activationInitialSpeed' | 'activationFinalSpeed' |
  'activationDuration' | 'activationRippleInterval' | 'activationRingWidth' |
  'gradientAngle' | 'gradientFadeEdgeTop' | 'gradientFadeEdgeBottom' | 'gradientFadeEdgeLeft' | 'gradientFadeEdgeRight' |
  'gradientAnimSpeed' | 'gradientFlowRotation' | 'gradientFlowWarp' | 'gradientFlowSoftness' |
  'gradientFlowComplexity' | 'gradientFlowParamA' | 'gradientFlowParamB' |
  'dynamicImageScale' | 'dynamicImageAspectRatio' | 'dynamicImageOffsetX' | 'dynamicImageOffsetY' |
  'dynamicImageSpeed' | 'dynamicImageStrength' | 'dynamicImageParamA' | 'dynamicImageParamB' | 'dynamicImageOpacity'
>;
type EffectTypeSelectValue = TextureEffect['type'] | `dynamicImageEffect:${TextureDynamicImageAlgorithm}`;

const STORAGE_KEY = 'dynamic-textures.current.v1';
const CANVAS_STATUS_SPACE = 32;
// Loading overlay timing: hide shortly after rendering quiets down, with a hard
// cap so continuously animating layers don't keep the spinner up indefinitely.
const CANVAS_LOADER_SETTLE_MS = 220;
const CANVAS_LOADER_MAX_MS = 700;

type TextureLayerBlendMode =
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

interface TextureLayer {
  kind: 'texture';
  id: string;
  name: string;
  visible: boolean;
  settings: TextureSettings;
  blendMode: TextureLayerBlendMode;
}

interface EffectLayer {
  kind: 'effect';
  id: string;
  name: string;
  visible: boolean;
  effect: TextureEffect;
}

type Layer = TextureLayer | EffectLayer;

interface TextureLayerState {
  layers: Layer[];
  selectedLayerId: string;
}

function reorderTextureLayerToIndex(layers: Layer[], fromId: string, toIndex: number) {
  const fromIndex = layers.findIndex(layer => layer.id === fromId);
  if (fromIndex < 0) return layers;
  const nextLayers = [...layers];
  const [moved] = nextLayers.splice(fromIndex, 1);
  const boundedIndex = clamp(toIndex, 0, nextLayers.length);
  if (boundedIndex === fromIndex) return layers;
  nextLayers.splice(boundedIndex, 0, moved);
  return nextLayers;
}

function reorderIdsToIndex(ids: string[], fromId: string, toIndex: number) {
  const fromIndex = ids.indexOf(fromId);
  if (fromIndex < 0) return ids;
  const nextIds = [...ids];
  const [moved] = nextIds.splice(fromIndex, 1);
  const boundedIndex = clamp(toIndex, 0, nextIds.length);
  if (boundedIndex === fromIndex) return ids;
  nextIds.splice(boundedIndex, 0, moved);
  return nextIds;
}

const BLEND_MODE_GROUPS: Array<{ title: string; options: Array<{ value: TextureLayerBlendMode; label: string }> }> = [
  {
    title: '基础',
    options: [
      { value: 'pass-through', label: '穿透' },
      { value: 'normal', label: '正常' },
    ],
  },
  {
    title: '变暗',
    options: [
      { value: 'darken', label: '变暗' },
      { value: 'multiply', label: '正片叠底' },
      { value: 'plus-darker', label: '加深' },
      { value: 'color-burn', label: '颜色加深' },
    ],
  },
  {
    title: '变亮',
    options: [
      { value: 'lighten', label: '变亮' },
      { value: 'screen', label: '滤色' },
      { value: 'plus-lighter', label: '加亮' },
      { value: 'color-dodge', label: '颜色减淡' },
    ],
  },
  {
    title: '叠加',
    options: [
      { value: 'overlay', label: '叠加' },
      { value: 'soft-light', label: '柔光' },
      { value: 'hard-light', label: '强光' },
    ],
  },
  {
    title: '差值',
    options: [
      { value: 'difference', label: '差值' },
      { value: 'exclusion', label: '排除' },
    ],
  },
  {
    title: '颜色',
    options: [
      { value: 'hue', label: '色相' },
      { value: 'saturation', label: '饱和度' },
      { value: 'color', label: '颜色' },
      { value: 'luminosity', label: '明度' },
    ],
  },
];

const BLEND_MODE_LABELS = new Map(BLEND_MODE_GROUPS.flatMap(group => group.options).map(option => [option.value, option.label]));
const PIXEL_GRAIN_BLEND_OPTIONS: Array<{ value: PixelGrainBlendMode; label: string }> = [
  { value: 'overlay', label: '叠加' },
  { value: 'softLight', label: '柔光' },
  { value: 'screen', label: '滤色' },
  { value: 'multiply', label: '正片叠底' },
];
const FLOW_DEFAULT_STOPS: GradientColorStop[] = [
  { position: 0, color: '#7B2FF7', opacity: 1 },
  { position: 0.34, color: '#2B86FF', opacity: 1 },
  { position: 0.67, color: '#19D39A', opacity: 1 },
  { position: 1, color: '#FF4FD8', opacity: 1 },
];

function createTextureLayer(index: number, settings: TextureSettings = TEXTURE_DEFAULTS): TextureLayer {
  return {
    kind: 'texture',
    id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: `图层${index}`,
    visible: true,
    settings: sanitizeTextureSettings(settings),
    blendMode: 'normal',
  };
}

function createEffectLayer(index: number, effect: TextureEffect): EffectLayer {
  return {
    kind: 'effect',
    id: `effect-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: `效果${index}`,
    visible: true,
    effect,
  };
}

function createSmudgeDistortionEffect(): SmudgeDistortionEffect {
  return sanitizeSmudgeDistortionEffect({
    enabled: true,
    transform: TRANSFORM_PARAMS_DEFAULTS,
    strength: 1,
    precision: 2,
    brushEnabled: true,
    brushSize: 176,
    brushStrength: 0.64,
    brushFeather: 80,
    strokes: [],
  });
}

function createPaintMaskEffect(): PaintMaskEffect {
  return sanitizePaintMaskEffect({
    enabled: true,
    brushEnabled: true,
    brush: 'black',
    brushSize: 176,
    brushOpacity: 0.1,
    brushFeather: 141,
    strokes: [],
  });
}

function createPixelGrainEffect(): PixelGrainEffect {
  return sanitizePixelGrainEffect({
    enabled: true,
    amount: 0.13,
    blendMode: 'overlay',
    seed: 173,
  });
}

function createDynamicImageEffect(algorithm: TextureDynamicImageAlgorithm = 'flowDistort'): DynamicImageEffect {
  const defaults = getDynamicImageAlgorithmDef(algorithm);
  return sanitizeDynamicImageEffect({
    enabled: true,
    transform: TRANSFORM_PARAMS_DEFAULTS,
    algorithm: defaults.id,
    speed: defaults.defaults.dynamicImageSpeed ?? 0.8,
    strength: defaults.defaults.dynamicImageStrength ?? 0.44,
    paramA: defaults.defaults.dynamicImageParamA ?? 0.5,
    paramB: defaults.defaults.dynamicImageParamB ?? 0.35,
    opacity: defaults.defaults.dynamicImageOpacity ?? 1,
  });
}

function createOutlinesEffect(): OutlinesEffect {
  return sanitizeOutlinesEffect({ enabled: true });
}

const DYNAMIC_IMAGE_EFFECT_TYPE_PREFIX = 'dynamicImageEffect:' as const;

function isDynamicImageAlgorithmValue(value: string): value is TextureDynamicImageAlgorithm {
  return DYNAMIC_IMAGE_ALGORITHM_VALUES.includes(value as TextureDynamicImageAlgorithm);
}

function parseEffectTypeSelectValue(value: string): { type: TextureEffect['type']; algorithm?: TextureDynamicImageAlgorithm } {
  if (value.startsWith(DYNAMIC_IMAGE_EFFECT_TYPE_PREFIX)) {
    const algorithm = value.slice(DYNAMIC_IMAGE_EFFECT_TYPE_PREFIX.length);
    return {
      type: 'dynamicImageEffect',
      algorithm: isDynamicImageAlgorithmValue(algorithm) ? algorithm : undefined,
    };
  }
  if (value === 'paintMask' || value === 'pixelGrain' || value === 'dynamicImageEffect' || value === 'outlines') {
    return { type: value };
  }
  return { type: 'smudgeDistortion' };
}

function toEffectTypeSelectValue(effect: TextureEffect): EffectTypeSelectValue {
  if (effect.type !== 'dynamicImageEffect') return effect.type;
  return `${DYNAMIC_IMAGE_EFFECT_TYPE_PREFIX}${effect.algorithm}`;
}

function effectSupportsTransform(effect: TextureEffect) {
  if (effect.type === 'smudgeDistortion') return true;
  if (effect.type !== 'dynamicImageEffect') return false;
  return isDynamicImageDeformationAlgorithm(effect.algorithm);
}

function sanitizeBlendMode(value: unknown): TextureLayerBlendMode {
  return BLEND_MODE_LABELS.has(value as TextureLayerBlendMode) ? value as TextureLayerBlendMode : 'normal';
}

function sanitizeTextureLayerState(raw: unknown): TextureLayerState {
  if (raw && typeof raw === 'object' && Array.isArray((raw as Partial<TextureLayerState>).layers)) {
    const input = raw as Partial<TextureLayerState>;
    const rawLayers = input.layers ?? [];
    const layers = rawLayers
      .map((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const layer = item as Partial<Layer> & { settings?: unknown; blendMode?: unknown; filter?: unknown; effect?: unknown; kind?: unknown; visible?: unknown };
        const id = typeof layer.id === 'string' && layer.id.trim() ? layer.id.trim() : `layer-${index + 1}`;
        const visible = layer.visible !== false;
        const rawKind = (layer as { kind?: unknown }).kind;
        if (rawKind === 'effect' || rawKind === 'filter') {
          return {
            kind: 'effect',
            id,
            name: typeof layer.name === 'string' && layer.name.trim() ? layer.name.trim() : `效果${index + 1}`,
            visible,
            effect: sanitizeTextureEffect(layer.effect ?? layer.filter),
          };
        }
        return {
          kind: 'texture',
          id,
          name: typeof layer.name === 'string' && layer.name.trim() ? layer.name.trim() : `图层${index + 1}`,
          visible,
          settings: sanitizeTextureSettings(layer.settings),
          blendMode: sanitizeBlendMode(layer.blendMode),
        };
      })
      .filter((item): item is Layer => item !== null);
    if (layers.length > 0) {
      const selectedLayerId = typeof input.selectedLayerId === 'string' && layers.some(layer => layer.id === input.selectedLayerId)
        ? input.selectedLayerId
        : layers[0].id;
      return { layers, selectedLayerId };
    }
  }

  const layer = createTextureLayer(1, sanitizeTextureSettings(raw));
  return { layers: [layer], selectedLayerId: layer.id };
}

function loadLocalLayerState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeTextureLayerState(JSON.parse(raw)) : sanitizeTextureLayerState(TEXTURE_DEFAULTS);
  } catch {
    return sanitizeTextureLayerState(TEXTURE_DEFAULTS);
  }
}

function updateSelectedLayer(layerState: TextureLayerState, update: (layer: TextureLayer) => TextureLayer): TextureLayerState {
  return {
    ...layerState,
    layers: layerState.layers.map(layer => layer.id === layerState.selectedLayerId && layer.kind === 'texture' ? update(layer) : layer),
  };
}

function updateSelectedEffect(layerState: TextureLayerState, update: (layer: EffectLayer) => EffectLayer): TextureLayerState {
  return {
    ...layerState,
    layers: layerState.layers.map(layer => layer.id === layerState.selectedLayerId && layer.kind === 'effect' ? update(layer) : layer),
  };
}

function layerBlendToCss(value: TextureLayerBlendMode) {
  if (value === 'pass-through' || value === 'normal') return 'normal';
  if (value === 'plus-darker') return 'darken';
  if (value === 'plus-lighter') return 'plus-lighter';
  return value;
}

function layerBlendToCanvas(value: TextureLayerBlendMode): GlobalCompositeOperation {
  if (value === 'pass-through' || value === 'normal') return 'source-over';
  if (value === 'plus-darker') return 'darken';
  if (value === 'plus-lighter') return 'lighter';
  return value;
}

function isGrayscaleStops(stops: GradientColorStop[]) {
  return stops.every(stop => {
    const n = Number.parseInt(stop.color.slice(1), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return Math.abs(r - g) <= 4 && Math.abs(g - b) <= 4 && Math.abs(r - b) <= 4;
  });
}

function areTextureLayerStatesEqual(a: TextureLayerState, b: TextureLayerState) {
  return JSON.stringify(sanitizeTextureLayerState(a)) === JSON.stringify(sanitizeTextureLayerState(b));
}

function serializeTextureLayerState(value: TextureLayerState) {
  return JSON.stringify(sanitizeTextureLayerState(value));
}

function getCompositeLayerSignature(layers: Layer[]) {
  return JSON.stringify(layers.map(layer => (
    layer.kind === 'texture'
      ? {
        kind: layer.kind,
        id: layer.id,
        visible: layer.visible,
        blendMode: layer.blendMode,
        settings: layer.settings,
      }
      : {
        kind: layer.kind,
        id: layer.id,
        visible: layer.visible,
        effect: layer.effect,
      }
  )));
}

function createPresetFromLayerState(
  id: string,
  name: string,
  layerState: TextureLayerState,
  createdAt: string,
  updatedAt: string,
): TexturePreset {
  const cleanLayerState = sanitizeTextureLayerState(layerState);
  const selectedLayer = cleanLayerState.layers.find((layer): layer is TextureLayer => layer.id === cleanLayerState.selectedLayerId && layer.kind === 'texture');
  const firstTextureLayer = cleanLayerState.layers.find((layer): layer is TextureLayer => layer.kind === 'texture');
  return {
    id,
    name,
    settings: (selectedLayer ?? firstTextureLayer)?.settings ?? TEXTURE_DEFAULTS,
    layerState: cleanLayerState,
    createdAt,
    updatedAt,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function pointDistance(a: SmudgeDistortionPoint, b: SmudgeDistortionPoint, width: number, height: number) {
  return Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
}

function textureNeedsContinuousComposite(settings: TextureSettings) {
  if (!settings.enabled) return false;
  if (settings.textureType === 'gradient') {
    return settings.animEnabled !== false && isGradientAlgorithm(settings.gradientAnimType);
  }
  if (settings.textureType === 'dynamicImage') {
    return false;
  }
  return settings.animEnabled !== false || settings.activationEnabled;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getTextureSourceCanvas(
  output: HTMLCanvasElement,
  layerId: string,
  layerCanvases: Record<string, DynamicTextureCanvasHandle | null>,
) {
  const refCanvas = layerCanvases[layerId]?.getCanvas() ?? null;
  if (refCanvas) return refCanvas;
  const host = output.parentElement;
  if (!host) return null;
  return Array.from(host.querySelectorAll<HTMLCanvasElement>('canvas[data-texture-layer-id]'))
    .find(canvas => canvas.dataset.textureLayerId === layerId) ?? null;
}

type DynamicEffectFallbackState = {
  sourceCanvas: HTMLCanvasElement;
  sourceCtx: CanvasRenderingContext2D | null;
  glState: DynamicImageGLState | null | undefined;
};

const dynamicEffectFallbackStates = new WeakMap<HTMLCanvasElement, DynamicEffectFallbackState>();

function normalizeDynamicImageFilterParams(effect: DynamicImageEffect): { paramA: number; paramB: number } {
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

function needsDynamicImageEdgeSafeZoom(algorithm: TextureDynamicImageAlgorithm) {
  return algorithm === 'flowDistort' || algorithm === 'ripple' || algorithm === 'chromaticAberration';
}

function drawCenteredSafeZoom(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  width: number,
  height: number,
  zoom: number,
) {
  const safeZoom = Math.max(1, Number.isFinite(zoom) ? zoom : 1);
  if (safeZoom <= 1.0001) {
    ctx.drawImage(source, 0, 0, width, height);
    return;
  }
  const sampleW = width / safeZoom;
  const sampleH = height / safeZoom;
  const sampleX = (width - sampleW) * 0.5;
  const sampleY = (height - sampleH) * 0.5;
  ctx.drawImage(source, sampleX, sampleY, sampleW, sampleH, 0, 0, width, height);
}

function getDynamicEffectFallbackState(output: HTMLCanvasElement): DynamicEffectFallbackState {
  const cached = dynamicEffectFallbackStates.get(output);
  if (cached) return cached;
  const sourceCanvas = document.createElement('canvas');
  const state: DynamicEffectFallbackState = {
    sourceCanvas,
    sourceCtx: sourceCanvas.getContext('2d', { willReadFrequently: true }),
    glState: undefined,
  };
  dynamicEffectFallbackStates.set(output, state);
  return state;
}

function getEffectTransform(effect: DynamicImageEffect | SmudgeDistortionEffect, width: number, height: number) {
  return clampTransformParamsToSize(effect.transform, width, height, TRANSFORM_PARAM_BOUNDS_DEFAULT);
}

function mapPointByInverseTransform(
  x: number,
  y: number,
  width: number,
  height: number,
  transform: TransformParams,
) {
  const nx = x - 0.5 - transform.offsetX / Math.max(1, width);
  const ny = y - 0.5 - transform.offsetY / Math.max(1, height);
  return {
    x: nx / Math.max(0.0001, transform.scale) + 0.5,
    y: ny / Math.max(0.0001, transform.scale * transform.aspectRatio) + 0.5,
  };
}

function isSameTransformParams(a: TransformParams, b: TransformParams) {
  return Math.abs(a.scale - b.scale) < 0.0001
    && Math.abs(a.aspectRatio - b.aspectRatio) < 0.0001
    && Math.abs(a.offsetX - b.offsetX) < 0.0001
    && Math.abs(a.offsetY - b.offsetY) < 0.0001;
}

function applyDynamicImageEffectFallback(
  outputCtx: CanvasRenderingContext2D,
  output: HTMLCanvasElement,
  width: number,
  height: number,
  effect: DynamicImageEffect,
  timeSec: number = performance.now() * 0.001,
) {
  const state = getDynamicEffectFallbackState(output);
  if (!state.sourceCtx) {
    if (import.meta.env.DEV) {
      console.warn('Dynamic image effect fallback skipped: source 2D context unavailable.');
    }
    return false;
  }
  if (state.sourceCanvas.width !== width) state.sourceCanvas.width = width;
  if (state.sourceCanvas.height !== height) state.sourceCanvas.height = height;
  state.sourceCtx.setTransform(1, 0, 0, 1, 0, 0);
  state.sourceCtx.clearRect(0, 0, width, height);
  const effectTransform = getEffectTransform(effect, width, height);
  const applyDeformationTransform = isDynamicImageDeformationAlgorithm(effect.algorithm);
  if (applyDeformationTransform) {
    const centerX = width * 0.5 + effectTransform.offsetX;
    const centerY = height * 0.5 + effectTransform.offsetY;
    state.sourceCtx.save();
    state.sourceCtx.translate(centerX, centerY);
    state.sourceCtx.scale(effectTransform.scale, effectTransform.scale * effectTransform.aspectRatio);
    state.sourceCtx.translate(-width * 0.5, -height * 0.5);
    drawCenteredSafeZoom(
      state.sourceCtx,
      output,
      width,
      height,
      needsDynamicImageEdgeSafeZoom(effect.algorithm) ? 1.02 : 1,
    );
    state.sourceCtx.restore();
  } else {
    drawCenteredSafeZoom(
      state.sourceCtx,
      output,
      width,
      height,
      needsDynamicImageEdgeSafeZoom(effect.algorithm) ? 1.02 : 1,
    );
  }
  if (state.glState === undefined) {
    state.glState = createDynamicImageGL();
  }
  if (!state.glState) {
    if (import.meta.env.DEV) {
      console.warn('Dynamic image effect fallback skipped: WebGL unavailable.');
    }
    return false;
  }
  const normalized = normalizeDynamicImageFilterParams(effect);
  const ok = renderDynamicImageGL(state.glState, {
    width,
    height,
    source: state.sourceCanvas,
    fit: 'cover',
    algorithm: effect.algorithm,
    timeSec,
    speed: effect.speed,
    strength: effect.strength,
    paramA: normalized.paramA,
    paramB: normalized.paramB,
    opacity: effect.opacity,
  });
  if (!ok) {
    if (import.meta.env.DEV) {
      console.warn('Dynamic image effect fallback skipped: single-pass render failed.');
    }
    return false;
  }
  outputCtx.globalCompositeOperation = 'source-over';
  outputCtx.drawImage(state.glState.canvas, 0, 0, width, height);
  return true;
}

function drawLayerStack(
  output: HTMLCanvasElement,
  layers: Layer[],
  layerCanvases: Record<string, DynamicTextureCanvasHandle | null>,
  width: number,
  height: number,
) {
  const timeSec = performance.now() * 0.001;
  const visibleLayers = layers.filter(layer => layer.visible !== false);
  const textureSourceCanvases = new Map<string, HTMLCanvasElement>();
  for (const layer of visibleLayers) {
    if (layer.kind !== 'texture') continue;
    const source = getTextureSourceCanvas(output, layer.id, layerCanvases);
    if (!source || source.width !== width || source.height !== height) continue;
    textureSourceCanvases.set(layer.id, source);
  }
  const hasTextureLayer = visibleLayers.some(layer => layer.kind === 'texture');
  if (hasTextureLayer && textureSourceCanvases.size === 0) {
    if (import.meta.env.DEV) {
      console.warn('Composite skipped: no ready texture source canvas.');
    }
    return;
  }

  const webglLayers: WebGLCompositeLayer[] = visibleLayers.map(layer => {
    if (layer.kind === 'texture') {
      const frameVersion = layerCanvases[layer.id]?.getFrameVersion() ?? 0;
      return {
        kind: 'texture',
        id: layer.id,
        blendMode: layer.blendMode,
        canvas: textureSourceCanvases.get(layer.id) ?? null,
        frameVersion,
      };
    }
    return {
      kind: 'effect',
      id: layer.id,
      effect: layer.effect,
    };
  });
  const hasActiveWebglEffect = visibleLayers.some(layer => (
    layer.kind === 'effect' &&
    layer.effect.enabled &&
    (
      (layer.effect.type === 'smudgeDistortion' && layer.effect.strength > 0 && layer.effect.strokes.length > 0)
      || (layer.effect.type === 'pixelGrain' && layer.effect.amount > 0)
      || (layer.effect.type === 'dynamicImageEffect' && layer.effect.opacity > 0 && layer.effect.strength > 0)
      || (layer.effect.type === 'outlines' && layer.effect.count > 0 && layer.effect.thickness > 0)
    )
  ));
  if (hasActiveWebglEffect && drawLayerStackWebGL(output, webglLayers, width, height, timeSec)) return;

  const outputCtx = output.getContext('2d', { willReadFrequently: true });
  if (!outputCtx || width <= 0 || height <= 0) return;
  if (output.width !== width) output.width = width;
  if (output.height !== height) output.height = height;
  outputCtx.setTransform(1, 0, 0, 1, 0, 0);
  outputCtx.clearRect(0, 0, width, height);

  const drawOrder = [...visibleLayers].reverse();
  let hasDrawnLayer = false;
  for (const layer of drawOrder) {
    if (layer.kind === 'texture') {
      const source = textureSourceCanvases.get(layer.id);
      if (!source) continue;
      outputCtx.globalCompositeOperation = hasDrawnLayer ? layerBlendToCanvas(layer.blendMode) : 'source-over';
      outputCtx.drawImage(source, 0, 0, width, height);
      hasDrawnLayer = true;
      continue;
    }

    if (!hasDrawnLayer || !layer.effect.enabled) continue;
    if (layer.effect.type === 'smudgeDistortion') {
      if (layer.effect.strength <= 0 || layer.effect.strokes.length === 0) continue;
      applySmudgeDistortion(outputCtx, width, height, layer.effect);
      continue;
    }
    if (layer.effect.type === 'paintMask') {
      if (layer.effect.strokes.length === 0) continue;
      applyPaintMask(outputCtx, width, height, layer.effect);
      continue;
    }
    if (layer.effect.type === 'dynamicImageEffect') {
      if (layer.effect.strength <= 0 || layer.effect.opacity <= 0) continue;
      applyDynamicImageEffectFallback(outputCtx, output, width, height, layer.effect, timeSec);
      continue;
    }
    if (layer.effect.type === 'outlines') {
      if (layer.effect.count <= 0 || layer.effect.thickness <= 0) continue;
      applyOutlines(outputCtx, width, height, layer.effect, timeSec);
      continue;
    }
    if (layer.effect.amount <= 0) continue;
    applyPixelGrain(outputCtx, width, height, layer.effect);
  }
  outputCtx.globalCompositeOperation = 'source-over';
  outputCtx.globalAlpha = 1;
}

function smudgeFieldKey(effect: SmudgeDistortionEffect, width: number, height: number) {
  const transform = getEffectTransform(effect, width, height);
  return `${width}x${height}:${effect.strength}:${effect.precision}:${transform.scale.toFixed(4)}:${transform.aspectRatio.toFixed(4)}:${transform.offsetX.toFixed(2)}:${transform.offsetY.toFixed(2)}:${effect.strokes.map(stroke => (
    `${stroke.brushSize},${stroke.brushStrength},${stroke.brushFeather}:` +
    stroke.points.map(point => `${point.x.toFixed(4)},${point.y.toFixed(4)}`).join(';')
  )).join('|')}`;
}

type SmudgeFieldCache = {
  key: string;
  fieldWidth: number;
  fieldHeight: number;
  dxField: Float32Array;
  dyField: Float32Array;
};

// The displacement field only depends on the strokes/params, not on the (per
// frame changing) source pixels. Cache it so animated textures under a smudge
// filter don't rebuild the whole field every composite frame.
let smudgeFieldCache: SmudgeFieldCache | null = null;

function buildSmudgeField(effect: SmudgeDistortionEffect, width: number, height: number, precision: number) {
  const key = smudgeFieldKey(effect, width, height);
  const fieldWidth = width * precision;
  const fieldHeight = height * precision;
  const cached = smudgeFieldCache;
  if (
    cached &&
    cached.key === key &&
    cached.fieldWidth === fieldWidth &&
    cached.fieldHeight === fieldHeight
  ) {
    return cached;
  }

  const maxDim = Math.max(width, height);
  const transform = getEffectTransform(effect, width, height);
  const dxField = new Float32Array(fieldWidth * fieldHeight);
  const dyField = new Float32Array(fieldWidth * fieldHeight);

  for (const stroke of effect.strokes) {
    const radius = Math.max(2, stroke.brushSize / 2) * precision;
    const feather = Math.max(0, stroke.brushFeather) * precision;
    const spread = radius + feather;
    const inner = Math.max(0, radius - feather);
    const force = stroke.brushStrength * effect.strength * 0.34;
    if (force <= 0 || spread <= 0) continue;

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

  smudgeFieldCache = { key, fieldWidth, fieldHeight, dxField, dyField };
  return smudgeFieldCache;
}

function applySmudgeDistortion(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  effect: SmudgeDistortionEffect,
) {
  const source = ctx.getImageData(0, 0, width, height);
  const output = ctx.createImageData(width, height);
  const src = source.data;
  const dst = output.data;
  const maxDim = Math.max(width, height);
  const precision = Math.max(1, Math.min(4, Math.round(effect.precision)));
  const fieldWidth = width * precision;
  const fieldHeight = height * precision;
  const { dxField, dyField } = buildSmudgeField(effect, width, height, precision);

  const sampleField = (field: Float32Array, x: number, y: number) => {
    const fx = clamp(((x + 0.5) / width) * fieldWidth - 0.5, 0, fieldWidth - 1);
    const fy = clamp(((y + 0.5) / height) * fieldHeight - 0.5, 0, fieldHeight - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(fieldWidth - 1, x0 + 1);
    const y1 = Math.min(fieldHeight - 1, y0 + 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const i00 = y0 * fieldWidth + x0;
    const i10 = y0 * fieldWidth + x1;
    const i01 = y1 * fieldWidth + x0;
    const i11 = y1 * fieldWidth + x1;
    const top = field[i00] * (1 - tx) + field[i10] * tx;
    const bottom = field[i01] * (1 - tx) + field[i11] * tx;
    return top * (1 - ty) + bottom * ty;
  };

  const sampleSource = (x: number, y: number, channel: number) => {
    const sx = clamp(x, 0, width - 1);
    const sy = clamp(y, 0, height - 1);
    const x0 = Math.floor(sx);
    const y0 = Math.floor(sy);
    const x1 = Math.min(width - 1, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const tx = sx - x0;
    const ty = sy - y0;
    const i00 = (y0 * width + x0) * 4 + channel;
    const i10 = (y0 * width + x1) * 4 + channel;
    const i01 = (y1 * width + x0) * 4 + channel;
    const i11 = (y1 * width + x1) * 4 + channel;
    const top = src[i00] * (1 - tx) + src[i10] * tx;
    const bottom = src[i01] * (1 - tx) + src[i11] * tx;
    return Math.round(top * (1 - ty) + bottom * ty);
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const dx = sampleField(dxField, x, y);
      const dy = sampleField(dyField, x, y);
      const sx = x - dx * maxDim;
      const sy = y - dy * maxDim;
      const dstIdx = idx * 4;
      dst[dstIdx] = sampleSource(sx, sy, 0);
      dst[dstIdx + 1] = sampleSource(sx, sy, 1);
      dst[dstIdx + 2] = sampleSource(sx, sy, 2);
      dst[dstIdx + 3] = sampleSource(sx, sy, 3);
    }
  }

  ctx.putImageData(output, 0, 0);
}

function applyPaintMask(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  effect: PaintMaskEffect,
) {
  if (!effect.enabled || effect.strokes.length === 0) return;
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
  if (!maskCtx) return;

  maskCtx.clearRect(0, 0, width, height);
  maskCtx.fillStyle = '#ffffff';
  maskCtx.fillRect(0, 0, width, height);

  const paintSegment = (stroke: PaintMaskStroke, from: SmudgeDistortionPoint, to: SmudgeDistortionPoint) => {
    const radius = Math.max(2, stroke.brushSize / 2);
    const feather = Math.max(0, stroke.brushFeather);
    const spread = radius + feather;
    const innerRadius = Math.max(0, radius - feather);
    const opacity = clamp(stroke.brushOpacity, 0, 1);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    const step = Math.max(1, spread * 0.2);
    const steps = Math.max(1, Math.ceil(distance / step));

    for (let i = 0; i <= steps; i += 1) {
      const t = steps <= 1 ? 0 : i / steps;
      const x = (from.x + dx * t) * width;
      const y = (from.y + dy * t) * height;
      const gradient = maskCtx.createRadialGradient(x, y, innerRadius, x, y, spread);
      const color = stroke.brush === 'white' ? '255,255,255' : '0,0,0';
      gradient.addColorStop(0, `rgba(${color},${opacity})`);
      gradient.addColorStop(1, `rgba(${color},0)`);
      maskCtx.fillStyle = gradient;
      maskCtx.beginPath();
      maskCtx.arc(x, y, spread, 0, Math.PI * 2);
      maskCtx.fill();
    }
  };

  for (const stroke of effect.strokes) {
    if (stroke.points.length === 0) continue;
    if (stroke.points.length === 1) {
      paintSegment(stroke, stroke.points[0], stroke.points[0]);
      continue;
    }
    for (let i = 1; i < stroke.points.length; i += 1) {
      paintSegment(stroke, stroke.points[i - 1], stroke.points[i]);
    }
  }

  const source = ctx.getImageData(0, 0, width, height);
  const mask = maskCtx.getImageData(0, 0, width, height).data;
  const data = source.data;
  for (let i = 0; i < width * height; i += 1) {
    const alpha = mask[i * 4] / 255;
    const idx = i * 4;
    data[idx] = Math.round(data[idx] * alpha);
    data[idx + 1] = Math.round(data[idx + 1] * alpha);
    data[idx + 2] = Math.round(data[idx + 2] * alpha);
    data[idx + 3] = Math.round(data[idx + 3] * alpha);
  }
  ctx.putImageData(source, 0, 0);
}

function pixelGrainNoise(x: number, y: number, seed: number) {
  const value = Math.sin((x + 1.37) * 12.9898 + (y + 4.17) * 78.233 + seed * 0.137) * 43758.5453;
  return value - Math.floor(value);
}

function overlayBlendChannel(base: number, top: number) {
  return base <= 0.5 ? 2 * base * top : 1 - 2 * (1 - base) * (1 - top);
}

function softLightBlendChannel(base: number, top: number) {
  return top <= 0.5
    ? base - (1 - 2 * top) * base * (1 - base)
    : base + (2 * top - 1) * (Math.sqrt(Math.max(base, 0)) - base);
}

function blendPixelGrainChannel(base: number, top: number, blendMode: PixelGrainBlendMode) {
  if (blendMode === 'multiply') return base * top;
  if (blendMode === 'screen') return 1 - (1 - base) * (1 - top);
  if (blendMode === 'softLight') return softLightBlendChannel(base, top);
  return overlayBlendChannel(base, top);
}

function applyPixelGrain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  effect: PixelGrainEffect,
) {
  const source = ctx.getImageData(0, 0, width, height);
  const data = source.data;
  const amount = clamp(effect.amount, 0, 1);
  if (amount <= 0) return;
  const seed = Math.round(clamp(effect.seed, 1, 9999));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const noise = pixelGrainNoise(x, y, seed);
      const top = clamp(0.5 + (noise - 0.5) * 0.82, 0, 1);
      const idx = (y * width + x) * 4;
      const baseAlpha = data[idx + 3] / 255;
      if (baseAlpha <= 0) continue;
      const baseR = data[idx] / 255;
      const baseG = data[idx + 1] / 255;
      const baseB = data[idx + 2] / 255;
      const mixAmount = amount * baseAlpha;
      const outR = baseR + (blendPixelGrainChannel(baseR, top, effect.blendMode) - baseR) * mixAmount;
      const outG = baseG + (blendPixelGrainChannel(baseG, top, effect.blendMode) - baseG) * mixAmount;
      const outB = baseB + (blendPixelGrainChannel(baseB, top, effect.blendMode) - baseB) * mixAmount;
      data[idx] = Math.round(clamp(outR, 0, 1) * 255);
      data[idx + 1] = Math.round(clamp(outG, 0, 1) * 255);
      data[idx + 2] = Math.round(clamp(outB, 0, 1) * 255);
    }
  }
  ctx.putImageData(source, 0, 0);
}

function applyOutlines(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  effect: OutlinesEffect,
  timeSec: number,
) {
  const source = ctx.getImageData(0, 0, width, height);
  const data = source.data;
  const threshold = clamp(effect.threshold, 0, 1);
  const count = Math.max(1, Math.round(effect.count));
  const fieldScale = clamp(effect.fieldScale, 0, 1);
  const thicknessPx = clamp(effect.thickness, 0.5, 8);
  const spacing = clamp(effect.spacing, 0.2, 8);
  const softness = clamp(effect.softness, 0, 1);
  const offset = clamp(effect.offset, -1, 1);
  const blurOffsets = getOutlinesBlurOffsets(effect.smoothing, effect.gaussianSamples);
  const phase = effect.phase + offset + (effect.animationEnabled ? timeSec * clamp(effect.speed, 0, 3) : 0);
  const frequency = count / spacing;
  const contrast = 1 + fieldScale * 2;
  const softPx = 0.5 + softness * 0.75;
  const stops = effect.lineGradientStops.length >= 2 ? effect.lineGradientStops : OUTLINES_DEFAULT_LINE_GRADIENT;
  const maxX = width - 1;
  const maxY = height - 1;
  const idxOf = (x: number, y: number) => y * width + x;
  const smoothstep = (edge0: number, edge1: number, value: number) => {
    const t = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const parseHexRgb = (hex: string) => {
    const safeHex = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#ffffff';
    const value = Number.parseInt(safeHex.slice(1), 16);
    return {
      r: ((value >> 16) & 255) / 255,
      g: ((value >> 8) & 255) / 255,
      b: (value & 255) / 255,
    };
  };
  const sampleLineGradient = (t: number) => {
    const clamped = clamp(t, 0, 1);
    let from = stops[0];
    let to = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i += 1) {
      const left = stops[i];
      const right = stops[i + 1];
      if (clamped >= left.position && clamped <= right.position) {
        from = left;
        to = right;
        break;
      }
    }
    const range = Math.max(0.0001, to.position - from.position);
    const local = smoothstep(0, 1, (clamped - from.position) / range);
    const c0 = parseHexRgb(from.color);
    const c1 = parseHexRgb(to.color);
    return {
      r: c0.r + (c1.r - c0.r) * local,
      g: c0.g + (c1.g - c0.g) * local,
      b: c0.b + (c1.b - c0.b) * local,
      a: from.opacity + (to.opacity - from.opacity) * local,
    };
  };
  const sampleField = (r: number, g: number, b: number, a: number) => {
    const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (effect.inputMode === 'alpha') return a / 255;
    if (effect.inputMode === 'inverseLuma') return 1 - luma;
    return luma;
  };
  const field = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dataIdx = (y * width + x) * 4;
      field[idxOf(x, y)] = sampleField(data[dataIdx], data[dataIdx + 1], data[dataIdx + 2], data[dataIdx + 3]);
    }
  }
  let smoothedField = field;
  for (const rawOffset of blurOffsets) {
    if (rawOffset <= 0) continue;
    const sampleOffset = Math.max(1, Math.round(rawOffset));
    const next = new Float32Array(width * height);
    for (let y = 0; y < height; y += 1) {
      const y0 = clamp(y - sampleOffset, 0, maxY);
      const y1 = clamp(y + sampleOffset, 0, maxY);
      for (let x = 0; x < width; x += 1) {
        const x0 = clamp(x - sampleOffset, 0, maxX);
        const x1 = clamp(x + sampleOffset, 0, maxX);
        next[idxOf(x, y)] = (
          smoothedField[idxOf(x0, y0)]
          + smoothedField[idxOf(x1, y0)]
          + smoothedField[idxOf(x0, y1)]
          + smoothedField[idxOf(x1, y1)]
        ) * 0.25;
      }
    }
    smoothedField = next;
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIdx = idxOf(x, y);
      const dataIdx = pixelIdx * 4;
      const baseAlpha = data[dataIdx + 3] / 255;
      if (baseAlpha <= 0) continue;
      const baseR = data[dataIdx] / 255;
      const baseG = data[dataIdx + 1] / 255;
      const baseB = data[dataIdx + 2] / 255;
      const fieldValue = smoothedField[pixelIdx];
      const mapped = (fieldValue - threshold) * contrast;
      const band = mapped * frequency + phase;
      const cycle = band - Math.floor(band);
      const distCycle = Math.abs(cycle - 0.5);
      const left = smoothedField[idxOf(Math.max(0, x - 1), y)];
      const right = smoothedField[idxOf(Math.min(maxX, x + 1), y)];
      const top = smoothedField[idxOf(x, Math.max(0, y - 1))];
      const bottom = smoothedField[idxOf(x, Math.min(maxY, y + 1))];
      const gradX = (right - left) * 0.5;
      const gradY = (bottom - top) * 0.5;
      const gradBand = Math.max(0.0001, Math.hypot(gradX, gradY) * Math.abs(contrast * frequency));
      const distPx = distCycle / gradBand;
      const halfPx = thicknessPx * 0.5;
      const line = 1 - smoothstep(Math.max(0, halfPx - softPx * 0.5), halfPx + softPx * 0.5, distPx);
      const lineColor = sampleLineGradient(0.5 + mapped + offset * 0.5);
      const amount = line * lineColor.a * baseAlpha;
      if (amount <= 0.0001) continue;
      data[dataIdx] = Math.round(clamp(baseR + (lineColor.r - baseR) * amount, 0, 1) * 255);
      data[dataIdx + 1] = Math.round(clamp(baseG + (lineColor.g - baseG) * amount, 0, 1) * 255);
      data[dataIdx + 2] = Math.round(clamp(baseB + (lineColor.b - baseB) * amount, 0, 1) * 255);
    }
  }
  ctx.putImageData(source, 0, 0);
}

function PanelGroup({
  title,
  children,
  headerActions,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  headerActions?: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const toggleOpen = () => setOpen(value => !value);
  return (
    <section className="panel-group">
      <div className="group-title">
        <button className="group-title-toggle" type="button" onClick={toggleOpen}>
          <span>{title}</span>
        </button>
        <div className="group-title-actions">
          {headerActions}
        </div>
        <button
          type="button"
          className="group-chevron-button"
          aria-label={open ? `收起${title}` : `展开${title}`}
          onClick={toggleOpen}
        >
          <svg className={open ? 'chevron open' : 'chevron'} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="m3.5 6 4.5 4.5L12.5 6" />
          </svg>
        </button>
      </div>
      {open ? <div className="group-body">{children}</div> : null}
    </section>
  );
}

function parseLooseNumber(raw: string) {
  const normalized = raw.trim().replace(/，/g, '.');
  const match = normalized.match(/-?(?:\d+\.?\d*|\.\d+)/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format = nextValue => String(nextValue),
  parseInput,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (nextValue: number) => void;
  format?: (value: number) => string;
  parseInput?: (raw: string) => number | null;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(() => format(value));
  const [isComposing, setIsComposing] = useState(false);

  useEffect(() => {
    if (isEditing) return;
    setDraft(format(value));
  }, [format, isEditing, value]);

  const commitDraft = useCallback(() => {
    const parsedValue = parseInput ? parseInput(draft) : parseLooseNumber(draft);
    if (parsedValue === null) {
      setDraft(format(value));
      setIsEditing(false);
      return;
    }
    const nextValue = clamp(parsedValue, min, max);
    if (Math.abs(nextValue - value) > Number.EPSILON) onChange(nextValue);
    setDraft(format(nextValue));
    setIsEditing(false);
  }, [draft, format, max, min, onChange, parseInput, value]);

  return (
    <label className="field">
      <span>
        <span>{label}</span>
        {isEditing ? (
          <input
            className="field-value-input"
            value={draft}
            onChange={event => setDraft(event.currentTarget.value)}
            onBlur={commitDraft}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            onKeyDown={event => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setDraft(format(value));
                setIsEditing(false);
                return;
              }
              if (event.key !== 'Enter' || isComposing) return;
              event.preventDefault();
              commitDraft();
              event.currentTarget.blur();
            }}
            autoFocus
            inputMode="decimal"
            aria-label={`${label} 数值输入`}
          />
        ) : (
          <button
            type="button"
            className="field-value-button"
            onClick={() => {
              setDraft(format(value));
              setIsEditing(true);
            }}
            aria-label={`编辑${label}`}
          >
            {format(value)}
          </button>
        )}
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.currentTarget.value))} />
    </label>
  );
}

function GradientStopsEditor({ stops, onChange }: { stops: GradientColorStop[]; onChange: (stops: GradientColorStop[]) => void }) {
  const [draftStops, setDraftStops] = useState<GradientColorStop[] | null>(null);
  const draftStopsRef = useRef<GradientColorStop[] | null>(null);
  const effective = draftStops ?? stops;
  const sorted = useMemo(() => [...effective].sort((a, b) => a.position - b.position), [effective]);
  const sortedRef = useRef(sorted);
  const previewRef = useRef<HTMLDivElement>(null);
  const stopIdMapRef = useRef<WeakMap<GradientColorStop, string>>(new WeakMap());
  const nextStopIdRef = useRef(0);
  const [draggingStopId, setDraggingStopId] = useState<string | null>(null);
  const [editingPositionStopId, setEditingPositionStopId] = useState<string | null>(null);
  const [positionDraft, setPositionDraft] = useState('');
  const gradient = `linear-gradient(90deg, ${sorted.map(stop => `${stop.color}${Math.round(stop.opacity * 255).toString(16).padStart(2, '0')} ${(stop.position * 100).toFixed(1)}%`).join(', ')})`;
  const getStopId = (stop: GradientColorStop) => {
    const found = stopIdMapRef.current.get(stop);
    if (found) return found;
    const created = `stop-${nextStopIdRef.current}`;
    nextStopIdRef.current += 1;
    stopIdMapRef.current.set(stop, created);
    return created;
  };
  const getStopKey = (stop: GradientColorStop) => getStopId(stop);

  useEffect(() => {
    sortedRef.current = sorted;
  }, [sorted]);

  const getBoundedPosition = (position: number) => clamp(position, 0, 1);

  const applyPatch = (source: GradientColorStop[], stopId: string, patch: Partial<GradientColorStop>) =>
    source
      .map(stop => {
        if (getStopId(stop) !== stopId) return stop;
        const updated = { ...stop, ...patch };
        stopIdMapRef.current.set(updated, stopId);
        return updated;
      })
      .sort((a, b) => a.position - b.position);

  const updateStopLocal = (stopId: string, patch: Partial<GradientColorStop>) => {
    const next = applyPatch(draftStopsRef.current ?? sortedRef.current, stopId, patch);
    draftStopsRef.current = next;
    setDraftStops(next);
  };

  const commitDraft = () => {
    const draft = draftStopsRef.current;
    if (!draft) return;
    draftStopsRef.current = null;
    setDraftStops(null);
    onChange(draft);
  };

  const updateStopImmediate = (stopId: string, patch: Partial<GradientColorStop>) => {
    const next = applyPatch(draftStopsRef.current ?? sortedRef.current, stopId, patch);
    draftStopsRef.current = null;
    setDraftStops(null);
    onChange(next);
  };

  useEffect(() => {
    if (draggingStopId === null) return;

    const handlePointerMove = (event: PointerEvent) => {
      const preview = previewRef.current;
      if (!preview) return;
      const rect = preview.getBoundingClientRect();
      if (rect.width <= 0) return;
      const raw = (event.clientX - rect.left) / rect.width;
      updateStopLocal(draggingStopId, { position: getBoundedPosition(raw) });
    };

    const handlePointerUp = () => {
      commitDraft();
      setDraggingStopId(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [draggingStopId]);

  return (
    <div className="gradient-editor">
      <div className="gradient-preview-wrap">
        <div className="gradient-preview" ref={previewRef} style={{ background: gradient }}>
          {sorted.map((stop, index) => (
            <button
              type="button"
              key={getStopKey(stop)}
              className={draggingStopId === getStopId(stop) ? 'gradient-stop-handle active' : 'gradient-stop-handle'}
              style={{ left: `${stop.position * 100}%`, '--stop-color': stop.color } as React.CSSProperties & { '--stop-color': string }}
              onPointerDown={event => {
                event.preventDefault();
                setDraggingStopId(getStopId(stop));
              }}
              aria-label={`拖动颜色节点 ${index + 1}`}
            />
          ))}
        </div>
      </div>
      {sorted.map((stop, index) => (
        <div className="stop-row" key={getStopKey(stop)}>
          <ColorInput value={stop.color} onChange={color => updateStopImmediate(getStopId(stop), { color })} ariaLabel={`编辑颜色节点 ${index + 1}`} />
          <label>
            <span>位置</span>
            <div className="stop-position-input">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={editingPositionStopId === getStopId(stop) ? positionDraft : Math.round(stop.position * 100)}
                onFocus={() => {
                  setEditingPositionStopId(getStopId(stop));
                  setPositionDraft(String(Math.round(stop.position * 100)));
                }}
                onChange={event => {
                  setPositionDraft(event.currentTarget.value);
                }}
                onBlur={() => {
                  const parsed = parseInt(positionDraft, 10);
                  if (!Number.isNaN(parsed)) {
                    const newPos = getBoundedPosition(parsed / 100);
                    if (Math.round(newPos * 100) !== Math.round(stop.position * 100)) {
                      updateStopImmediate(getStopId(stop), { position: newPos });
                    }
                  }
                  setEditingPositionStopId(null);
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur();
                  } else if (event.key === 'Escape') {
                    setPositionDraft(String(Math.round(stop.position * 100)));
                    event.currentTarget.blur();
                  }
                }}
              />
              <span>%</span>
            </div>
          </label>
          <label>
            <span>透明度</span>
            <input type="range" min={0} max={1} step={0.01} value={stop.opacity}
              onChange={event => updateStopLocal(getStopId(stop), { opacity: Number(event.currentTarget.value) })}
              onPointerUp={() => commitDraft()}
            />
          </label>
          <button type="button" disabled={sorted.length <= 2} onClick={() => {
            draftStopsRef.current = null;
            setDraftStops(null);
            onChange(sorted.filter((_, i) => i !== index));
          }}>删除</button>
        </div>
      ))}
      <button type="button" className="wide-button" disabled={sorted.length >= 8} onClick={() => {
        draftStopsRef.current = null;
        setDraftStops(null);
        onChange([...sorted, { position: 0.5, color: '#ffffff', opacity: 1 }].sort((a, b) => a.position - b.position));
      }}>
        添加颜色
      </button>
    </div>
  );
}

export default function App() {
  const [layerState, setLayerState] = useState<TextureLayerState>(() => loadLocalLayerState());
  const [dynamicImageAssets, setDynamicImageAssets] = useState<Record<string, DynamicImageAsset>>({});
  const [dynamicImageUploadError, setDynamicImageUploadError] = useState<string | null>(null);
  const [isDynamicImageUploading, setIsDynamicImageUploading] = useState(false);
  const [presets, setPresets] = useState<TexturePreset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null);
  const [dragPreviewOrder, setDragPreviewOrder] = useState<string[] | null>(null);
  const [serializedLayerState, setSerializedLayerState] = useState(() => serializeTextureLayerState(loadLocalLayerState()));
  const [canvasWidth, setCanvasWidth] = useState(1920);
  const [canvasHeight, setCanvasHeight] = useState(1080);
  const [canvasWidthInput, setCanvasWidthInput] = useState('1920');
  const [canvasHeightInput, setCanvasHeightInput] = useState('1080');
  const [previewColor, setPreviewColor] = useState('#F5F5F6');
  const layerCanvasRefs = useRef<Record<string, DynamicTextureCanvasHandle | null>>({});
  const compositeCanvasRef = useRef<HTMLCanvasElement>(null);
  const smudgeBrushPreviewRef = useRef<HTMLDivElement>(null);
  const smudgeBrushPreviewInnerRef = useRef<HTMLDivElement>(null);
  const smudgePaintingRef = useRef(false);
  const smudgeStrokeRef = useRef<SmudgeDistortionStroke | null>(null);
  const lastSmudgePointRef = useRef<SmudgeDistortionPoint | null>(null);
  const paintMaskPaintingRef = useRef(false);
  const paintMaskStrokeRef = useRef<PaintMaskStroke | null>(null);
  const lastPaintMaskPointRef = useRef<SmudgeDistortionPoint | null>(null);
  const layerRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const selectedIdRef = useRef<string | null>(null);
  const dynamicImageAssetsRef = useRef<Record<string, DynamicImageAsset>>({});
  const dynamicImageInputRef = useRef<HTMLInputElement>(null);
  const stageViewportRef = useRef<HTMLDivElement>(null);
  const compositeFrameRef = useRef(0);
  const compositeNeedsFollowupRef = useRef(false);
  const lastCompositeSignatureRef = useRef('');
  const pendingProcessingCommitRef = useRef(false);
  const processingCommitTimeoutRef = useRef(0);
  const dragPreviewOrderRef = useRef<string[] | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [processingTask, setProcessingTask] = useState<string | null>(null);
  const [isCanvasUpdating, setIsCanvasUpdating] = useState(false);
  const isCanvasUpdatingRef = useRef(false);
  const loaderSettleTimerRef = useRef(0);
  const loaderHardStopTimerRef = useRef(0);
  const pendingPaintBarrierRef = useRef(false);
  const selectedLayer = useMemo(
    () => layerState.layers.find(layer => layer.id === layerState.selectedLayerId) ?? layerState.layers[0],
    [layerState.layers, layerState.selectedLayerId],
  );
  const selectedTextureLayer = selectedLayer?.kind === 'texture' ? selectedLayer : null;
  const selectedEffectLayer = selectedLayer?.kind === 'effect' ? selectedLayer : null;
  const settings = selectedTextureLayer?.settings ?? TEXTURE_DEFAULTS;
  const effectSettings = selectedEffectLayer?.effect ?? null;
  const selectedDynamicImageAsset = selectedTextureLayer ? dynamicImageAssets[selectedTextureLayer.id] ?? null : null;
  const displayedLayers = useMemo(() => {
    if (!dragPreviewOrder) return layerState.layers;
    const layerMap = new Map(layerState.layers.map(layer => [layer.id, layer]));
    return dragPreviewOrder
      .map(id => layerMap.get(id))
      .filter((layer): layer is Layer => Boolean(layer));
  }, [dragPreviewOrder, layerState.layers]);

  useEffect(() => {
    readPresetFile().then(file => {
      setPresets(file.presets);
      const nextSelectedId = file.selectedId ?? file.presets[0]?.id ?? null;
      setSelectedId(nextSelectedId);
      selectedIdRef.current = nextSelectedId;
      const selected = file.presets.find(preset => preset.id === nextSelectedId);
      if (selected) {
        setLayerState(sanitizeTextureLayerState(selected.layerState));
      }
    }).catch(error => console.warn('Failed to load texture presets:', error));
  }, []);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    dragPreviewOrderRef.current = dragPreviewOrder;
  }, [dragPreviewOrder]);

  useEffect(() => {
    dynamicImageAssetsRef.current = dynamicImageAssets;
  }, [dynamicImageAssets]);

  useEffect(() => {
    setDynamicImageUploadError(null);
  }, [layerState.selectedLayerId]);

  useEffect(() => {
    setDynamicImageAssets(prev => {
      const validTextureLayers = new Set(
        layerState.layers
          .filter((layer): layer is TextureLayer => layer.kind === 'texture' && layer.settings.textureType === 'dynamicImage')
          .map(layer => layer.id),
      );
      let changed = false;
      const next: Record<string, DynamicImageAsset> = {};
      for (const [layerId, asset] of Object.entries(prev)) {
        if (validTextureLayers.has(layerId)) {
          next[layerId] = asset;
        } else {
          releaseDynamicImageAsset(asset);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [layerState.layers]);

  useEffect(() => () => {
    for (const asset of Object.values(dynamicImageAssetsRef.current)) {
      releaseDynamicImageAsset(asset);
    }
  }, []);

  useEffect(() => {
    setCanvasWidthInput(String(canvasWidth));
  }, [canvasWidth]);

  useEffect(() => {
    setCanvasHeightInput(String(canvasHeight));
  }, [canvasHeight]);

  useEffect(() => {
    const element = stageViewportRef.current;
    if (!element) return;

    const syncSize = () => {
      const rect = element.getBoundingClientRect();
      setStageSize({
        width: Math.max(0, rect.width),
        height: Math.max(0, rect.height),
      });
    };

    syncSize();
    const observer = new ResizeObserver(syncSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const selectedPreset = useMemo(
    () => presets.find(preset => preset.id === selectedId) ?? null,
    [presets, selectedId],
  );
  const compositeLayerSignature = useMemo(() => getCompositeLayerSignature(layerState.layers), [layerState.layers]);
  const hasContinuousTextureSource = useMemo(
    () => layerState.layers.some(layer => (
      layer.kind === 'texture'
      && layer.visible !== false
      && textureNeedsContinuousComposite(layer.settings)
    )),
    [layerState.layers],
  );
  const hasContinuousEffectAnimation = useMemo(
    () => layerState.layers.some(layer => (
      layer.visible !== false
      && (
        (layer.kind === 'effect' && layer.effect.type === 'dynamicImageEffect' && layer.effect.enabled && layer.effect.opacity > 0 && layer.effect.strength > 0)
        || (layer.kind === 'effect' && layer.effect.type === 'outlines' && layer.effect.enabled && layer.effect.animationEnabled && layer.effect.count > 0 && layer.effect.thickness > 0 && layer.effect.speed > 0)
      )
    )),
    [layerState.layers],
  );
  const serializedSelectedPresetState = useMemo(
    () => selectedPreset ? serializeTextureLayerState(sanitizeTextureLayerState(selectedPreset.layerState)) : null,
    [selectedPreset],
  );
  const hasUnsavedChanges = selectedPreset !== null && serializedLayerState !== serializedSelectedPresetState;
  const previewScale = useMemo(() => {
    if (stageSize.width <= 0 || stageSize.height <= 0) return 1;
    const availableHeight = Math.max(1, stageSize.height - CANVAS_STATUS_SPACE);
    return Math.min(stageSize.width / canvasWidth, availableHeight / canvasHeight, 1);
  }, [stageSize, canvasWidth, canvasHeight]);
  const previewWidth = Math.max(1, Math.round(canvasWidth * previewScale));
  const previewHeight = Math.max(1, Math.round(canvasHeight * previewScale));

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const nextSerializedState = serializeTextureLayerState(layerState);
      setSerializedLayerState(current => current === nextSerializedState ? current : nextSerializedState);
      localStorage.setItem(STORAGE_KEY, nextSerializedState);
    }, 120);
    return () => window.clearTimeout(timeout);
  }, [layerState]);

  const setCanvasUpdating = useCallback((value: boolean) => {
    isCanvasUpdatingRef.current = value;
    setIsCanvasUpdating(value);
  }, []);

  const finishCanvasUpdate = useCallback(() => {
    if (loaderSettleTimerRef.current) {
      window.clearTimeout(loaderSettleTimerRef.current);
      loaderSettleTimerRef.current = 0;
    }
    if (loaderHardStopTimerRef.current) {
      window.clearTimeout(loaderHardStopTimerRef.current);
      loaderHardStopTimerRef.current = 0;
    }
    setCanvasUpdating(false);
  }, [setCanvasUpdating]);

  // Re-arm the settle timer whenever the canvas reports rendering progress, so
  // the loader stays visible across multi-stage work and hides once it quiets.
  const markCanvasActivity = useCallback(() => {
    if (!isCanvasUpdatingRef.current) return;
    if (loaderSettleTimerRef.current) window.clearTimeout(loaderSettleTimerRef.current);
    loaderSettleTimerRef.current = window.setTimeout(finishCanvasUpdate, CANVAS_LOADER_SETTLE_MS);
  }, [finishCanvasUpdate]);

  // Called synchronously from user actions that trigger a heavy recompute.
  const beginCanvasUpdate = useCallback(() => {
    pendingPaintBarrierRef.current = true;
    if (!isCanvasUpdatingRef.current) setCanvasUpdating(true);
    if (loaderSettleTimerRef.current) window.clearTimeout(loaderSettleTimerRef.current);
    loaderSettleTimerRef.current = window.setTimeout(finishCanvasUpdate, CANVAS_LOADER_SETTLE_MS);
    if (loaderHardStopTimerRef.current) window.clearTimeout(loaderHardStopTimerRef.current);
    loaderHardStopTimerRef.current = window.setTimeout(finishCanvasUpdate, CANVAS_LOADER_MAX_MS);
  }, [finishCanvasUpdate, setCanvasUpdating]);

  const drawComposite = useCallback(() => {
    const canvas = compositeCanvasRef.current;
    if (!canvas) return;
    const canUseSignatureCache = !hasContinuousEffectAnimation;
    const sourceVersions = layerState.layers.map(layer => {
      if (layer.kind === 'effect') return `${layer.id}:effect:${layer.visible}`;
      return `${layer.id}:${layer.visible}:${layerCanvasRefs.current[layer.id]?.getFrameVersion() ?? 0}`;
    }).join('|');
    const signature = `${canvasWidth}x${canvasHeight}:${compositeLayerSignature}:${sourceVersions}`;
    if (canUseSignatureCache && signature === lastCompositeSignatureRef.current) return;
    try {
      drawLayerStack(canvas, layerState.layers, layerCanvasRefs.current, canvasWidth, canvasHeight);
      const hasReadyTextureLayer = layerState.layers.some(layer => (
        layer.kind === 'texture' &&
        layer.visible !== false &&
        (layerCanvasRefs.current[layer.id]?.getFrameVersion() ?? 0) > 0
      ));
      const hasVisibleTextureLayer = layerState.layers.some(layer => layer.kind === 'texture' && layer.visible !== false);
      if (hasReadyTextureLayer || !hasVisibleTextureLayer) {
        lastCompositeSignatureRef.current = signature;
      }
      markCanvasActivity();
    } finally {
      if (!pendingProcessingCommitRef.current) {
        setProcessingTask(null);
      }
    }
  }, [canvasHeight, canvasWidth, compositeLayerSignature, hasContinuousEffectAnimation, layerState.layers, markCanvasActivity]);

  const requestCompositeDraw = useCallback(() => {
    if (compositeFrameRef.current) {
      compositeNeedsFollowupRef.current = true;
      return;
    }
    const runComposite = () => {
      const needsFollowup = compositeNeedsFollowupRef.current;
      compositeFrameRef.current = 0;
      compositeNeedsFollowupRef.current = false;
      drawComposite();
      if (needsFollowup || compositeNeedsFollowupRef.current) {
        requestCompositeDraw();
      }
    };
    if (pendingPaintBarrierRef.current) {
      // Insert one extra painted frame before the heavy composite so the
      // loading overlay becomes visible before the main thread is blocked.
      pendingPaintBarrierRef.current = false;
      compositeFrameRef.current = requestAnimationFrame(() => {
        compositeFrameRef.current = requestAnimationFrame(runComposite);
      });
    } else {
      compositeFrameRef.current = requestAnimationFrame(runComposite);
    }
  }, [drawComposite]);

  // Catch-all: any change that alters the rendered output (layer visibility,
  // blend mode, ordering, add/remove, texture or filter settings) changes the
  // composite signature. Showing the loader here guarantees every canvas-update
  // operation surfaces the animation, even ones without an explicit trigger.
  // Declared before the composite-trigger effect so the paint barrier is armed
  // before the composite is scheduled.
  const compositeSignatureInitRef = useRef(true);
  useEffect(() => {
    if (compositeSignatureInitRef.current) {
      compositeSignatureInitRef.current = false;
      return;
    }
    beginCanvasUpdate();
  }, [compositeLayerSignature, beginCanvasUpdate]);

  useEffect(() => {
    requestCompositeDraw();
    const retryFrame = requestAnimationFrame(requestCompositeDraw);
    const retryTimeout = window.setTimeout(drawComposite, 80);
    const lateRetryTimeout = window.setTimeout(drawComposite, 240);
    return () => {
      cancelAnimationFrame(retryFrame);
      window.clearTimeout(retryTimeout);
      window.clearTimeout(lateRetryTimeout);
    };
  }, [drawComposite, requestCompositeDraw]);

  useEffect(() => {
    if (!hasContinuousEffectAnimation || hasContinuousTextureSource) return;
    let frame = 0;
    const tick = () => {
      drawComposite();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [drawComposite, hasContinuousEffectAnimation, hasContinuousTextureSource]);

  useEffect(() => {
    return () => {
      if (compositeFrameRef.current) {
        cancelAnimationFrame(compositeFrameRef.current);
        compositeFrameRef.current = 0;
      }
      compositeNeedsFollowupRef.current = false;
      if (processingCommitTimeoutRef.current) window.clearTimeout(processingCommitTimeoutRef.current);
      if (loaderSettleTimerRef.current) window.clearTimeout(loaderSettleTimerRef.current);
      if (loaderHardStopTimerRef.current) window.clearTimeout(loaderHardStopTimerRef.current);
    };
  }, []);

  const updateSettings = (patch: Partial<TextureSettings>) => {
    beginCanvasUpdate();
    setLayerState(prev => updateSelectedLayer(prev, layer => ({
      ...layer,
      settings: sanitizeTextureSettings({ ...layer.settings, ...patch }),
    })));
  };

  const replaceSettings = (next: TextureSettings) => {
    beginCanvasUpdate();
    setLayerState(prev => updateSelectedLayer(prev, layer => ({ ...layer, settings: sanitizeTextureSettings(next) })));
  };

  const applyDynamicImageFile = useCallback(async (file: File) => {
    if (!selectedTextureLayer || selectedTextureLayer.settings.textureType !== 'dynamicImage') return;
    setIsDynamicImageUploading(true);
    setDynamicImageUploadError(null);
    try {
      const loadedAsset = await loadDynamicImageFile(file);
      setDynamicImageAssets(prev => {
        const previous = prev[selectedTextureLayer.id];
        if (previous) {
          releaseDynamicImageAsset(previous);
        }
        return { ...prev, [selectedTextureLayer.id]: loadedAsset };
      });
      beginCanvasUpdate();
      setLayerState(prev => updateSelectedLayer(prev, layer => {
        if (layer.id !== selectedTextureLayer.id) return layer;
        return {
          ...layer,
          settings: sanitizeTextureSettings({
            ...layer.settings,
            dynamicImageAssetId: loadedAsset.id,
            dynamicImageAssetName: loadedAsset.name,
            dynamicImageAssetWidth: loadedAsset.width,
            dynamicImageAssetHeight: loadedAsset.height,
          }),
        };
      }));
    } catch (error) {
      setDynamicImageUploadError(error instanceof Error ? error.message : '图像上传失败，请重试');
    } finally {
      setIsDynamicImageUploading(false);
      if (dynamicImageInputRef.current) {
        dynamicImageInputRef.current.value = '';
      }
    }
  }, [beginCanvasUpdate, selectedTextureLayer]);

  const removeSelectedDynamicImage = useCallback(() => {
    if (!selectedTextureLayer || selectedTextureLayer.settings.textureType !== 'dynamicImage') return;
    setDynamicImageUploadError(null);
    setDynamicImageAssets(prev => {
      const previous = prev[selectedTextureLayer.id];
      if (!previous) return prev;
      releaseDynamicImageAsset(previous);
      const next = { ...prev };
      delete next[selectedTextureLayer.id];
      return next;
    });
    updateSettings({
      dynamicImageAssetId: '',
      dynamicImageAssetName: '',
      dynamicImageAssetWidth: 0,
      dynamicImageAssetHeight: 0,
    });
  }, [selectedTextureLayer, updateSettings]);

  const commitCanvasDimension = (
    draftValue: string,
    committedValue: number,
    setCommittedValue: React.Dispatch<React.SetStateAction<number>>,
    setDraftValue: React.Dispatch<React.SetStateAction<string>>,
  ) => {
    const parsedValue = Number.parseInt(draftValue, 10);
    if (!Number.isFinite(parsedValue)) {
      setDraftValue(String(committedValue));
      return;
    }
    const nextValue = Math.max(100, parsedValue);
    if (nextValue !== committedValue) beginCanvasUpdate();
    setCommittedValue(nextValue);
    setDraftValue(String(nextValue));
  };

  const isTextureLayerSelected = selectedLayer?.kind === 'texture';
  const isEffectLayerSelected = selectedLayer?.kind === 'effect';
  const isHalftoneTexture = isTextureLayerSelected && settings.textureType === 'halftone';
  const isGradientTexture = isTextureLayerSelected && settings.textureType === 'gradient';
  const isDynamicImageTexture = isTextureLayerSelected && settings.textureType === 'dynamicImage';
  const textureTransformBounds = isGradientTexture ? GRADIENT_ALGO_TRANSFORM_PARAM_BOUNDS : TRANSFORM_PARAM_BOUNDS_DEFAULT;
  const textureTransformParamDefs = isGradientTexture ? GRADIENT_ALGO_TRANSFORM_PARAM_DEFS : TRANSFORM_PARAM_DEFS;
  const currentTextureDefaults = useMemo(
    () => getTextureDefaults(settings.textureType),
    [settings.textureType],
  );
  const effectTransformEnabled = effectSettings ? effectSupportsTransform(effectSettings) : false;
  const textureTransform = useMemo(
    () => clampTransformParamsToSize(settings.transform, canvasWidth, canvasHeight, textureTransformBounds),
    [canvasHeight, canvasWidth, settings.transform, textureTransformBounds],
  );
  const textureDefaultTransform = useMemo(
    () => clampTransformParamsToSize(currentTextureDefaults.transform, canvasWidth, canvasHeight, textureTransformBounds),
    [canvasHeight, canvasWidth, currentTextureDefaults.transform, textureTransformBounds],
  );
  const isTextureTransformDefault = isSameTransformParams(textureTransform, textureDefaultTransform);
  const effectTransform = useMemo(() => {
    if (!effectSettings) return TRANSFORM_PARAMS_DEFAULTS;
    if (effectSettings.type === 'smudgeDistortion') {
      return clampTransformParamsToSize(effectSettings.transform, canvasWidth, canvasHeight, TRANSFORM_PARAM_BOUNDS_DEFAULT);
    }
    if (effectSettings.type === 'dynamicImageEffect' && isDynamicImageDeformationAlgorithm(effectSettings.algorithm)) {
      return clampTransformParamsToSize(effectSettings.transform, canvasWidth, canvasHeight, TRANSFORM_PARAM_BOUNDS_DEFAULT);
    }
    return TRANSFORM_PARAMS_DEFAULTS;
  }, [canvasHeight, canvasWidth, effectSettings]);
  const isEffectTransformDefault = isDefaultTransformParams(effectTransform);
  const currentGradientAlgorithm = useMemo(
    () => getGradientAlgorithmDef(settings.gradientAnimType),
    [settings.gradientAnimType],
  );
  const currentDynamicImageEffectAlgorithm = useMemo(
    () => getDynamicImageAlgorithmDef(effectSettings?.type === 'dynamicImageEffect' ? effectSettings.algorithm : 'flowDistort'),
    [effectSettings],
  );

  useEffect(() => {
    if (!isGradientTexture || isGradientAlgorithm(settings.gradientAnimType)) return;
    const defaultAlgorithm = getGradientAlgorithmDef('flow');
    updateSettings({
      gradientAnimType: defaultAlgorithm.id,
      ...defaultAlgorithm.defaults,
      gradientStops: isGrayscaleStops(settings.gradientStops) ? FLOW_DEFAULT_STOPS : settings.gradientStops,
    });
  }, [isGradientTexture, settings.gradientAnimType, settings.gradientStops]);

  const range = (
    key: NumberKey,
    label: string,
    min: number,
    max: number,
    step: number,
    format: (value: number) => string = value => String(value),
    parseInput?: (raw: string) => number | null,
  ) => {
    const value = Number(settings[key]);
    return (
      <SliderField
        key={key}
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        format={format}
        parseInput={parseInput}
        onChange={nextValue => updateSettings({ [key]: nextValue })}
      />
    );
  };

  const transformRange = (
    transform: TransformParams,
    onChange: (next: TransformParams) => void,
    key: TransformParamKey,
    format: (value: number) => string,
    defs = TRANSFORM_PARAM_DEFS,
    bounds = TRANSFORM_PARAM_BOUNDS_DEFAULT,
  ) => {
    const def = defs.find(item => item.key === key);
    if (!def) return null;
    const min = key === 'offsetX' ? -canvasWidth : key === 'offsetY' ? -canvasHeight : def.min;
    const max = key === 'offsetX' ? canvasWidth : key === 'offsetY' ? canvasHeight : def.max;
    return (
      <SliderField
        key={key}
        label={def.label}
        value={transform[key]}
        min={min}
        max={max}
        step={def.step}
        format={format}
        onChange={nextValue => {
          const next = sanitizeTransformParams({ ...transform, [key]: nextValue }, TRANSFORM_PARAMS_DEFAULTS, bounds);
          onChange(clampTransformParamsToSize(next, canvasWidth, canvasHeight, bounds));
        }}
      />
    );
  };

  const setSelectedEffectState = (nextEffect: TextureEffect) => {
    beginCanvasUpdate();
    setLayerState(prev => updateSelectedEffect(prev, layer => ({
      ...layer,
      effect: sanitizeTextureEffect(nextEffect),
    })));
  };

  const updateSelectedSmudgeEffectSettings = (patch: Partial<SmudgeDistortionEffect>) => {
    if (!effectSettings || effectSettings.type !== 'smudgeDistortion') return;
    setSelectedEffectState({ ...effectSettings, ...patch });
  };

  const updateSelectedPaintMaskSettings = (patch: Partial<PaintMaskEffect>) => {
    if (!effectSettings || effectSettings.type !== 'paintMask') return;
    setSelectedEffectState({ ...effectSettings, ...patch });
  };

  const updateSelectedPixelGrainSettings = (patch: Partial<PixelGrainEffect>) => {
    if (!effectSettings || effectSettings.type !== 'pixelGrain') return;
    setSelectedEffectState({ ...effectSettings, ...patch });
  };

  const updateSelectedDynamicImageEffectSettings = (patch: Partial<DynamicImageEffect>) => {
    if (!effectSettings || effectSettings.type !== 'dynamicImageEffect') return;
    setSelectedEffectState({ ...effectSettings, ...patch });
  };

  const updateSelectedOutlinesSettings = (patch: Partial<OutlinesEffect>) => {
    if (!effectSettings || effectSettings.type !== 'outlines') return;
    setSelectedEffectState({ ...effectSettings, ...patch });
  };

  const updateTextureTransform = (nextTransform: TransformParams) => {
    if (!isTextureLayerSelected) return;
    const transform = clampTransformParamsToSize(nextTransform, canvasWidth, canvasHeight, textureTransformBounds);
    updateSettings({
      transform,
      spotScale: transform.scale,
      spotOffsetX: transform.offsetX,
      spotOffsetY: transform.offsetY,
      dynamicImageScale: transform.scale,
      dynamicImageAspectRatio: transform.aspectRatio,
      dynamicImageOffsetX: transform.offsetX,
      dynamicImageOffsetY: transform.offsetY,
    });
  };

  const updateEffectTransform = (nextTransform: TransformParams) => {
    if (!effectSettings || !effectSupportsTransform(effectSettings)) return;
    const transform = clampTransformParamsToSize(nextTransform, canvasWidth, canvasHeight, TRANSFORM_PARAM_BOUNDS_DEFAULT);
    if (effectSettings.type === 'smudgeDistortion') {
      updateSelectedSmudgeEffectSettings({ transform });
      return;
    }
    updateSelectedDynamicImageEffectSettings({ transform });
  };

  const effectRange = (
    key: Extract<keyof SmudgeDistortionEffect, 'strength' | 'precision' | 'brushSize' | 'brushStrength' | 'brushFeather'>,
    label: string,
    min: number,
    max: number,
    step: number,
    format: (value: number) => string = value => String(value),
    parseInput?: (raw: string) => number | null,
  ) => {
    const value = Number(effectSettings && effectSettings.type === 'smudgeDistortion' ? effectSettings[key] : 0);
    return (
      <SliderField
        key={key}
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        format={format}
        parseInput={parseInput}
        onChange={nextValue => updateSelectedSmudgeEffectSettings({ [key]: nextValue })}
      />
    );
  };

  const paintMaskRange = (
    key: Extract<keyof PaintMaskEffect, 'brushSize' | 'brushOpacity' | 'brushFeather'>,
    label: string,
    min: number,
    max: number,
    step: number,
    format: (value: number) => string = value => String(value),
    parseInput?: (raw: string) => number | null,
  ) => {
    const value = Number(effectSettings && effectSettings.type === 'paintMask' ? effectSettings[key] : 0);
    return (
      <SliderField
        key={key}
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        format={format}
        parseInput={parseInput}
        onChange={nextValue => updateSelectedPaintMaskSettings({ [key]: nextValue })}
      />
    );
  };

  const pixelGrainRange = (
    key: Extract<keyof PixelGrainEffect, 'amount'>,
    label: string,
    min: number,
    max: number,
    step: number,
    format: (value: number) => string = value => String(value),
    parseInput?: (raw: string) => number | null,
  ) => {
    const value = Number(effectSettings && effectSettings.type === 'pixelGrain' ? effectSettings[key] : 0);
    return (
      <SliderField
        key={key}
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        format={format}
        parseInput={parseInput}
        onChange={nextValue => updateSelectedPixelGrainSettings({ [key]: nextValue })}
      />
    );
  };

  const dynamicImageEffectRange = (
    key: Extract<keyof DynamicImageEffect, 'speed' | 'strength' | 'paramA' | 'paramB' | 'opacity'>,
    label: string,
    min: number,
    max: number,
    step: number,
    format: (value: number) => string = value => String(value),
    parseInput?: (raw: string) => number | null,
  ) => {
    const value = Number(effectSettings && effectSettings.type === 'dynamicImageEffect' ? effectSettings[key] : 0);
    return (
      <SliderField
        key={key}
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        format={format}
        parseInput={parseInput}
        onChange={nextValue => updateSelectedDynamicImageEffectSettings({ [key]: nextValue })}
      />
    );
  };

  const outlinesRange = (
    key: Exclude<keyof OutlinesEffect, 'type' | 'enabled' | 'inputMode' | 'fieldScale' | 'lineGradientStops' | 'animationEnabled'>,
    label: string,
    min: number,
    max: number,
    step: number,
    format: (value: number) => string = value => String(value),
    parseInput?: (raw: string) => number | null,
  ) => {
    const value = Number(effectSettings && effectSettings.type === 'outlines' ? effectSettings[key] : 0);
    return (
      <SliderField
        key={key}
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        format={format}
        parseInput={parseInput}
        onChange={nextValue => updateSelectedOutlinesSettings({ [key]: nextValue })}
      />
    );
  };

  const savePreset = async () => {
    const now = new Date().toISOString();
    const name = window.prompt('输入纹理预设名称', `纹理预设 ${presets.length + 1}`)?.trim();
    if (!name) return;
    const preset = createPresetFromLayerState(`texture-${Date.now()}`, name, layerState, now, now);
    const file = await writePresetFile({ selectedId: preset.id, presets: [...presets, preset] });
    setPresets(file.presets);
    setSelectedId(file.selectedId);
    selectedIdRef.current = file.selectedId;
  };

  const saveCurrentPreset = async () => {
    if (!selectedPreset || !hasUnsavedChanges) return;
    const updatedAt = new Date().toISOString();
    const updatedPreset = createPresetFromLayerState(selectedPreset.id, selectedPreset.name, layerState, selectedPreset.createdAt, updatedAt);
    const nextPresets = presets.map(preset => preset.id === selectedPreset.id ? updatedPreset : preset);
    const file = await writePresetFile({ selectedId: selectedPreset.id, presets: nextPresets });
    setPresets(file.presets);
    setSelectedId(file.selectedId);
    selectedIdRef.current = file.selectedId;
  };

  const confirmPresetSwitch = (nextId: string | null) => {
    if (!selectedPreset || !hasUnsavedChanges) return true;
    if (nextId === selectedPreset.id) return true;
    return window.confirm(`当前预设「${selectedPreset.name}」有未保存的修改，切换后会放弃这些修改。确定继续吗？`);
  };

  const applyPreset = async (id: string) => {
    const preset = presets.find(item => item.id === id);
    if (!preset) return;
    const file = await writePresetFile({ selectedId: id, presets });
    setPresets(file.presets);
    setSelectedId(file.selectedId);
    selectedIdRef.current = file.selectedId;
    beginCanvasUpdate();
    setLayerState(sanitizeTextureLayerState(preset.layerState));
  };

  const handlePresetChange = (nextValue: string) => {
    const nextId = nextValue;
    if (!confirmPresetSwitch(nextId)) return;
    void applyPreset(nextValue);
  };

  const resetPreset = () => {
    if (!selectedPreset || !hasUnsavedChanges) return;
    const confirmed = window.confirm(`确定要重置预设「${selectedPreset.name}」吗？这会放弃当前所有未保存的修改。`);
    if (!confirmed) return;
    beginCanvasUpdate();
    setLayerState(sanitizeTextureLayerState(selectedPreset.layerState));
  };

  const deletePreset = async () => {
    if (!selectedId) return;
    if (presets.length <= 1) return;
    const preset = presets.find(item => item.id === selectedId);
    if (!preset) return;
    const confirmed = window.confirm(`确定删除预设「${preset.name}」吗？此操作无法撤销。`);
    if (!confirmed) return;
    const nextPresets = presets.filter(preset => preset.id !== selectedId);
    const nextSelectedId = nextPresets[0]?.id ?? null;
    const file = await writePresetFile({ selectedId: nextSelectedId, presets: nextPresets });
    setPresets(file.presets);
    const selectedFromFile = file.selectedId ?? file.presets[0]?.id ?? null;
    setSelectedId(selectedFromFile);
    selectedIdRef.current = selectedFromFile;
  };

  const renamePreset = async () => {
    if (!selectedId) return;
    const preset = presets.find(item => item.id === selectedId);
    if (!preset) return;
    const name = window.prompt('输入新的预设名称', preset.name)?.trim();
    if (!name || name === preset.name) return;
    const nextPresets = presets.map(item => item.id === selectedId ? { ...item, name, updatedAt: new Date().toISOString() } : item);
    const file = await writePresetFile({ selectedId, presets: nextPresets });
    setPresets(file.presets);
    setSelectedId(file.selectedId);
    selectedIdRef.current = file.selectedId;
  };

  const addLayer = () => {
    setLayerState(prev => {
      const nextLayer = createTextureLayer(prev.layers.filter(layer => layer.kind === 'texture').length + 1);
      return {
        layers: [nextLayer, ...prev.layers],
        selectedLayerId: nextLayer.id,
      };
    });
  };

  const addEffectLayer = () => {
    setLayerState(prev => {
      const nextLayer = createEffectLayer(
        prev.layers.filter(layer => layer.kind === 'effect').length + 1,
        createDynamicImageEffect('flowDistort'),
      );
      return {
        layers: [nextLayer, ...prev.layers],
        selectedLayerId: nextLayer.id,
      };
    });
  };

  const updateLayer = (id: string, patch: Partial<Pick<TextureLayer, 'name' | 'visible' | 'blendMode' | 'settings'>>) => {
    setLayerState(prev => ({
      ...prev,
      layers: prev.layers.map(layer => layer.id === id && layer.kind === 'texture' ? { ...layer, ...patch } : layer),
    }));
  };

  const updateEffectLayer = (id: string, patch: Partial<Pick<EffectLayer, 'name' | 'visible' | 'effect'>>) => {
    setLayerState(prev => ({
      ...prev,
      layers: prev.layers.map(layer => (
        layer.id === id && layer.kind === 'effect'
          ? {
              ...layer,
              ...patch,
              effect: patch.effect ? sanitizeTextureEffect(patch.effect) : layer.effect,
            }
          : layer
      )),
    }));
  };

  const changeSelectedEffectType = (nextValue: string) => {
    if (!selectedEffectLayer) return;
    const { type: nextType, algorithm } = parseEffectTypeSelectValue(nextValue);
    const nextEffect =
      nextType === 'paintMask'
        ? createPaintMaskEffect()
        : nextType === 'pixelGrain'
          ? createPixelGrainEffect()
          : nextType === 'outlines'
            ? createOutlinesEffect()
          : nextType === 'dynamicImageEffect'
          ? createDynamicImageEffect(algorithm ?? 'flowDistort')
          : createSmudgeDistortionEffect();
    updateEffectLayer(selectedEffectLayer.id, {
      effect: nextEffect,
    });
  };

  const deleteLayer = (id: string) => {
    setDynamicImageAssets(prev => {
      const previous = prev[id];
      if (!previous) return prev;
      releaseDynamicImageAsset(previous);
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setLayerState(prev => {
      if (prev.layers.length <= 1) return prev;
      const deleteIndex = prev.layers.findIndex(layer => layer.id === id);
      const layers = prev.layers.filter(layer => layer.id !== id);
      const selectedLayerId = prev.selectedLayerId === id
        ? layers[Math.min(Math.max(deleteIndex, 0), layers.length - 1)].id
        : prev.selectedLayerId;
      return { layers, selectedLayerId };
    });
    delete layerCanvasRefs.current[id];
    delete layerRowRefs.current[id];
    setDraggingLayerId(current => current === id ? null : current);
  };

  const getLayerInsertionIndex = (clientY: number, draggedId: string, layers: Layer[]) => {
    let insertionIndex = 0;

    for (const layer of layers) {
      if (layer.id === draggedId) continue;
      const node = layerRowRefs.current[layer.id];
      if (!node) continue;
      const rect = node.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return insertionIndex;
      insertionIndex += 1;
    }

    return insertionIndex;
  };

  const previewLayerMoveToIndex = (fromId: string, toIndex: number, layers: Layer[]) => {
    const currentIds = (dragPreviewOrderRef.current ?? layers.map(layer => layer.id)).filter(id => layers.some(layer => layer.id === id));
    const nextIds = reorderIdsToIndex(currentIds, fromId, toIndex);
    if (nextIds === currentIds) return;
    setDragPreviewOrder(previous => {
      if (previous && previous.length === nextIds.length && previous.every((id, index) => id === nextIds[index])) {
        return previous;
      }
      return nextIds;
    });
  };

  const finishLayerDrag = useCallback((draggedId: string, commitOrder: boolean) => {
    const previewOrder = dragPreviewOrderRef.current;
    setDraggingLayerId(null);
    setDragPreviewOrder(null);
    if (!commitOrder || !previewOrder) return;
    const targetIndex = previewOrder.indexOf(draggedId);
    if (targetIndex < 0) return;
    setLayerState(prev => {
      const layers = reorderTextureLayerToIndex(prev.layers, draggedId, targetIndex);
      return layers === prev.layers ? prev : { ...prev, layers };
    });
  }, []);

  const beginLayerDrag = (event: ReactPointerEvent<HTMLButtonElement>, layerId: string) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setLayerState(prev => ({ ...prev, selectedLayerId: layerId }));
    setDragPreviewOrder(layerState.layers.map(layer => layer.id));
    setDraggingLayerId(layerId);
  };

  useEffect(() => {
    if (!draggingLayerId) return;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    let dragFrame = 0;
    let latestClientY = 0;

    const handlePointerMove = (event: PointerEvent) => {
      event.preventDefault();
      latestClientY = event.clientY;
      if (dragFrame) return;
      dragFrame = requestAnimationFrame(() => {
        dragFrame = 0;
        const insertionIndex = getLayerInsertionIndex(latestClientY, draggingLayerId, displayedLayers);
        previewLayerMoveToIndex(draggingLayerId, insertionIndex, layerState.layers);
      });
    };

    const finishDrag = () => {
      if (dragFrame) {
        cancelAnimationFrame(dragFrame);
        dragFrame = 0;
      }
      finishLayerDrag(draggingLayerId, true);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (dragFrame) {
        cancelAnimationFrame(dragFrame);
        dragFrame = 0;
      }
      finishLayerDrag(draggingLayerId, false);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      if (dragFrame) cancelAnimationFrame(dragFrame);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [displayedLayers, draggingLayerId, finishLayerDrag, layerState.layers]);

  const exportCurrentImage = () => {
    const output = document.createElement('canvas');
    output.width = canvasWidth;
    output.height = canvasHeight;
    drawLayerStack(output, layerState.layers, layerCanvasRefs.current, canvasWidth, canvasHeight);
    const url = output.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = `dynamic-texture-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    link.click();
  };

  const syncEffectBrushPreview = (point: SmudgeDistortionPoint | null) => {
    const preview = smudgeBrushPreviewRef.current;
    const inner = smudgeBrushPreviewInnerRef.current;
    if (!preview || !inner || !effectSettings || !point) {
      if (preview) preview.style.opacity = '0';
      return;
    }
    if (effectSettings.type === 'pixelGrain' || effectSettings.type === 'dynamicImageEffect' || effectSettings.type === 'outlines') {
      preview.style.opacity = '0';
      return;
    }
    const isBrushEnabled = effectSettings.brushEnabled;
    if (!isBrushEnabled) {
      preview.style.opacity = '0';
      return;
    }
    const size = Math.max(4, effectSettings.brushSize);
    const feather = Math.max(0, effectSettings.brushFeather);
    const scale = previewScale;
    const outerSize = (size + feather * 2) * scale;
    const innerSize = size * scale;
    preview.style.opacity = '1';
    preview.style.left = `${point.x * canvasWidth * scale}px`;
    preview.style.top = `${point.y * canvasHeight * scale}px`;
    preview.style.width = `${outerSize}px`;
    preview.style.height = `${outerSize}px`;
    inner.style.width = `${innerSize}px`;
    inner.style.height = `${innerSize}px`;
    if (effectSettings.type === 'paintMask') {
      const opacity = Math.max(0, Math.min(1, effectSettings.brushOpacity));
      preview.style.borderColor = effectSettings.brush === 'white' ? 'rgba(17,24,39,0.8)' : 'rgba(255,255,255,0.95)';
      preview.style.background = effectSettings.brush === 'white'
        ? `rgba(255,255,255,${Math.max(0.04, opacity * 0.14)})`
        : `rgba(0,0,0,${Math.max(0.04, opacity * 0.14)})`;
      preview.style.boxShadow = effectSettings.brush === 'white'
        ? '0 0 0 1px rgba(255,255,255,0.6)'
        : '0 0 0 1px rgba(0,0,0,0.35)';
      inner.style.opacity = feather > 0 ? `${Math.max(0.15, opacity * 0.85)}` : '0';
      inner.style.borderColor = effectSettings.brush === 'white' ? 'rgba(17,24,39,0.45)' : 'rgba(255,255,255,0.55)';
    } else {
      preview.style.borderColor = 'rgba(255,255,255,0.95)';
      preview.style.background = 'transparent';
      preview.style.boxShadow = 'none';
      inner.style.opacity = feather > 0 ? '0.65' : '0';
      inner.style.borderColor = 'rgba(255,255,255,0.55)';
    }
  };

  const eventToCanvasPoint = (event: ReactPointerEvent<HTMLDivElement> | PointerEvent): SmudgeDistortionPoint => {
    const canvas = compositeCanvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    };
  };

  const commitSmudgeStroke = () => {
    const stroke = smudgeStrokeRef.current;
    smudgePaintingRef.current = false;
    smudgeStrokeRef.current = null;
    lastSmudgePointRef.current = null;
    if (!stroke || stroke.points.length < 2) return;
    beginCanvasUpdate();
    pendingProcessingCommitRef.current = true;
    setProcessingTask('涂抹畸变');
    processingCommitTimeoutRef.current = window.setTimeout(() => {
      pendingProcessingCommitRef.current = false;
      processingCommitTimeoutRef.current = 0;
      setLayerState(prev => updateSelectedEffect(prev, layer => {
        if (layer.effect.type !== 'smudgeDistortion') return layer;
        return {
          ...layer,
          effect: sanitizeSmudgeDistortionEffect({
            ...layer.effect,
            strokes: [...layer.effect.strokes, stroke].slice(-80),
          }),
        };
      }));
    }, 30);
  };

  const commitPaintMaskStroke = () => {
    const stroke = paintMaskStrokeRef.current;
    paintMaskPaintingRef.current = false;
    paintMaskStrokeRef.current = null;
    lastPaintMaskPointRef.current = null;
    if (!stroke || stroke.points.length < 1) return;
    beginCanvasUpdate();
    pendingProcessingCommitRef.current = true;
    setProcessingTask('绘制蒙版');
    processingCommitTimeoutRef.current = window.setTimeout(() => {
      pendingProcessingCommitRef.current = false;
      processingCommitTimeoutRef.current = 0;
      setLayerState(prev => updateSelectedEffect(prev, layer => {
        if (layer.effect.type !== 'paintMask') return layer;
        return {
          ...layer,
          effect: sanitizePaintMaskEffect({
            ...layer.effect,
            strokes: [...layer.effect.strokes, stroke].slice(-80),
          }),
        };
      }));
    }, 30);
  };

  const beginSmudgeStroke = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!effectSettings || effectSettings.type !== 'smudgeDistortion' || !effectSettings.brushEnabled || event.button !== 0) return;
    event.preventDefault();
    const point = eventToCanvasPoint(event);
    const stroke: SmudgeDistortionStroke = {
      points: [point],
      brushSize: effectSettings.brushSize,
      brushStrength: effectSettings.brushStrength,
      brushFeather: effectSettings.brushFeather,
    };
    smudgePaintingRef.current = true;
    smudgeStrokeRef.current = stroke;
    lastSmudgePointRef.current = point;
    syncEffectBrushPreview(point);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const beginPaintMaskStroke = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!effectSettings || effectSettings.type !== 'paintMask' || !effectSettings.brushEnabled || event.button !== 0) return;
    event.preventDefault();
    const point = eventToCanvasPoint(event);
    const stroke: PaintMaskStroke = {
      points: [point],
      brush: effectSettings.brush,
      brushSize: effectSettings.brushSize,
      brushOpacity: effectSettings.brushOpacity,
      brushFeather: effectSettings.brushFeather,
    };
    paintMaskPaintingRef.current = true;
    paintMaskStrokeRef.current = stroke;
    lastPaintMaskPointRef.current = point;
    syncEffectBrushPreview(point);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveSmudgeStroke = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = eventToCanvasPoint(event);
    syncEffectBrushPreview(point);
    if (!smudgePaintingRef.current || !smudgeStrokeRef.current) return;
    event.preventDefault();
    const last = lastSmudgePointRef.current;
    if (last && pointDistance(last, point, canvasWidth, canvasHeight) < 2) return;
    smudgeStrokeRef.current.points = [...smudgeStrokeRef.current.points, point].slice(-400);
    lastSmudgePointRef.current = point;
  };

  const movePaintMaskStroke = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = eventToCanvasPoint(event);
    syncEffectBrushPreview(point);
    if (!paintMaskPaintingRef.current || !paintMaskStrokeRef.current) return;
    event.preventDefault();
    const last = lastPaintMaskPointRef.current;
    if (last && pointDistance(last, point, canvasWidth, canvasHeight) < 2) return;
    paintMaskStrokeRef.current.points = [...paintMaskStrokeRef.current.points, point].slice(-400);
    lastPaintMaskPointRef.current = point;
  };

  const undoSmudgeStroke = () => {
    if (!effectSettings || effectSettings.type !== 'smudgeDistortion') return;
    updateSelectedSmudgeEffectSettings({ strokes: effectSettings.strokes.slice(0, -1) });
  };

  const resetSmudgeStrokes = () => {
    updateSelectedSmudgeEffectSettings({ strokes: [] });
  };

  const undoPaintMaskStroke = () => {
    if (!effectSettings || effectSettings.type !== 'paintMask') return;
    updateSelectedPaintMaskSettings({ strokes: effectSettings.strokes.slice(0, -1) });
  };

  const resetPaintMaskStrokes = () => {
    updateSelectedPaintMaskSettings({ strokes: [] });
  };

  const handleDynamicImageFileInput = (event: ReactChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    void applyDynamicImageFile(file);
  };

  const handleDynamicImageDrop = (event: ReactDragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    void applyDynamicImageFile(file);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <strong>Dynamic Textures</strong>
        <span>动态纹理工具</span>
      </header>

      <section className="stage">
        <div className="stage-viewport" ref={stageViewportRef}>
          <div className="canvas-card" style={{ width: previewWidth, height: previewHeight, background: previewColor }}>
            {layerState.layers.filter((layer): layer is TextureLayer => layer.kind === 'texture').map((layer, index) => (
              <div
                className="texture-layer-canvas texture-source-layer"
                key={layer.id}
                style={{
                  zIndex: index + 1,
                  pointerEvents: layer.id === layerState.selectedLayerId ? 'auto' : 'none',
                }}
              >
                <DynamicTextureCanvas
                  ref={handle => {
                    layerCanvasRefs.current[layer.id] = handle;
                    if (handle) requestCompositeDraw();
                  }}
                  settings={layer.settings}
                  dynamicImageAsset={dynamicImageAssets[layer.id] ?? null}
                  width={canvasWidth}
                  height={canvasHeight}
                  layerId={layer.id}
                  onFrame={hasContinuousTextureSource ? requestCompositeDraw : undefined}
                  renderScale={1}
                />
              </div>
            ))}
            <canvas
              ref={compositeCanvasRef}
              className="composite-canvas"
              width={canvasWidth}
              height={canvasHeight}
              style={{ pointerEvents: 'none' }}
            />
            <div className={`canvas-loader${isCanvasUpdating ? ' is-visible' : ''}`} aria-hidden={!isCanvasUpdating}>
              <div className="canvas-loader-orbit">
                <span className="canvas-loader-ring" />
              </div>
            </div>
            {isEffectLayerSelected && effectSettings && (
              (effectSettings.type === 'smudgeDistortion' || effectSettings.type === 'paintMask')
              && effectSettings.brushEnabled
            ) ? (
              <div
                className="smudge-input-layer"
                onPointerDown={event => {
                  if (effectSettings.type === 'paintMask') beginPaintMaskStroke(event);
                  else beginSmudgeStroke(event);
                }}
                onPointerMove={event => {
                  if (effectSettings.type === 'paintMask') movePaintMaskStroke(event);
                  else moveSmudgeStroke(event);
                }}
                onPointerUp={event => {
                  if (effectSettings.type === 'paintMask') commitPaintMaskStroke();
                  else commitSmudgeStroke();
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onPointerCancel={event => {
                  if (effectSettings.type === 'paintMask') commitPaintMaskStroke();
                  else commitSmudgeStroke();
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onPointerLeave={() => syncEffectBrushPreview(null)}
              />
            ) : null}
            <div className="smudge-brush-preview" ref={smudgeBrushPreviewRef}>
              <div ref={smudgeBrushPreviewInnerRef} />
            </div>
          </div>
          <div className="canvas-processing-status" aria-live="polite">
            {processingTask ? `正在处理：${processingTask}` : '\u00a0'}
          </div>
        </div>
      </section>

      <aside className="tool-panel">
        <PanelGroup title="画布">
          <label className="input-row"><span>宽度</span><input className="panel-number-input" type="text" inputMode="numeric" value={canvasWidthInput} onChange={event => setCanvasWidthInput(event.currentTarget.value)} onBlur={() => commitCanvasDimension(canvasWidthInput, canvasWidth, setCanvasWidth, setCanvasWidthInput)} /></label>
          <label className="input-row"><span>高度</span><input className="panel-number-input" type="text" inputMode="numeric" value={canvasHeightInput} onChange={event => setCanvasHeightInput(event.currentTarget.value)} onBlur={() => commitCanvasDimension(canvasHeightInput, canvasHeight, setCanvasHeight, setCanvasHeightInput)} /></label>
          <div className="input-row"><span>背景色</span><ColorInput value={previewColor} onChange={setPreviewColor} ariaLabel="编辑画布背景色" /></div>
          <button type="button" className="wide-button" onClick={exportCurrentImage}>导出图片</button>
        </PanelGroup>

        <PanelGroup title="纹理预设">
          <div className="button-row preset-actions">
            <button type="button" className="wide-button" onClick={savePreset}>保存为新预设</button>
            <button type="button" className="save-button" disabled={!selectedPreset || !hasUnsavedChanges} onClick={saveCurrentPreset}>保存</button>
          </div>
          <select
            value={selectedId ?? presets[0]?.id ?? ''}
            onChange={event => handlePresetChange(event.currentTarget.value)}
          >
            {presets.map(preset => (
              <option key={preset.id} value={preset.id}>
                {preset.name}{selectedId === preset.id && hasUnsavedChanges ? '*' : ''}
              </option>
            ))}
          </select>
          <div className="button-row preset-manage-row">
            <button type="button" className="wide-button" disabled={!selectedId} onClick={renamePreset}>重命名</button>
            <button type="button" className="wide-button" disabled={!selectedPreset || !hasUnsavedChanges} onClick={resetPreset}>重置</button>
            <button type="button" className="danger-button" disabled={!selectedId || presets.length <= 1} onClick={deletePreset}>删除</button>
          </div>
        </PanelGroup>

        <PanelGroup title="纹理层">
          <div className="layer-add-row">
            <button type="button" className="add-layer-button" onClick={addLayer}>新建图层 +</button>
            <button type="button" className="add-layer-button" onClick={addEffectLayer}>新建效果 +</button>
          </div>
          <div className="texture-layer-list">
            {displayedLayers.map(layer => (
              <div
                className={`texture-layer-row ${layer.kind === 'effect' ? 'effect-layer-row' : ''} ${layer.visible === false ? 'hidden-layer' : ''} ${layer.id === layerState.selectedLayerId ? 'active' : ''} ${layer.id === draggingLayerId ? 'dragging' : ''}`}
                key={layer.id}
                ref={node => { layerRowRefs.current[layer.id] = node; }}
                onClick={() => setLayerState(prev => ({ ...prev, selectedLayerId: layer.id }))}
              >
                <button
                  type="button"
                  className="layer-drag-handle"
                  aria-label="拖动调整图层顺序"
                  onPointerDown={event => beginLayerDrag(event, layer.id)}
                  onClick={event => event.stopPropagation()}
                >
                  ⋮⋮
                </button>
                <input
                  aria-label={layer.kind === 'effect' ? '效果名称' : '图层名称'}
                  value={layer.name}
                  onChange={event => {
                    if (layer.kind === 'effect') updateEffectLayer(layer.id, { name: event.currentTarget.value });
                    else updateLayer(layer.id, { name: event.currentTarget.value });
                  }}
                  onClick={event => event.stopPropagation()}
                />
                {layer.kind === 'texture' ? <select
                  className="blend-mode-select"
                  value={layer.blendMode}
                  onChange={event => updateLayer(layer.id, { blendMode: event.currentTarget.value as TextureLayerBlendMode })}
                  onClick={event => event.stopPropagation()}
                >
                  {BLEND_MODE_GROUPS.map(group => (
                    <optgroup key={group.title} label={group.title}>
                      {group.options.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select> : null}
                <button
                  type="button"
                  className="layer-visibility-button"
                  aria-label={layer.visible === false ? '显示图层' : '隐藏图层'}
                  aria-pressed={layer.visible !== false}
                  onClick={event => {
                    event.stopPropagation();
                    if (layer.kind === 'effect') updateEffectLayer(layer.id, { visible: layer.visible === false });
                    else updateLayer(layer.id, { visible: layer.visible === false });
                  }}
                >
                  <img src={layer.visible === false ? eyeClosedIcon : eyeIcon} alt="" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="layer-delete-button"
                  aria-label="删除图层"
                  disabled={layerState.layers.length <= 1}
                  onClick={event => {
                    event.stopPropagation();
                    deleteLayer(layer.id);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </PanelGroup>

        <PanelGroup title={selectedLayer?.name?.trim() || '图层类型'}>
          {isTextureLayerSelected ? <label className="input-row selected-layer-type-row">
            <span>图层类型</span>
            <select
              value={settings.textureType}
              onChange={event => {
                const textureType = event.currentTarget.value as TextureType;
                replaceSettings(getTextureDefaults(textureType));
              }}
            >
              <option value="halftone">半调点阵</option>
              <option value="gradient">渐变背景</option>
              <option value="dynamicImage">图像</option>
            </select>
          </label> : null}
          {isEffectLayerSelected && effectSettings ? <label className="input-row selected-layer-type-row">
            <span>效果类型</span>
            <select value={toEffectTypeSelectValue(effectSettings)} onChange={event => changeSelectedEffectType(event.currentTarget.value)}>
              <option value="paintMask">绘制蒙版</option>
              {DYNAMIC_IMAGE_ALGORITHM_GROUPS.map(group => {
                const staticOptions = group.group === '风格化'
                  ? [
                    { value: 'pixelGrain', label: '像素颗粒' },
                    { value: 'outlines', label: '轮廓线' },
                  ]
                  : [];
                const dynamicOptions = group.group === '形变'
                  ? [
                    ...(group.items[0] ? [group.items[0]] : []),
                    null,
                    ...group.items.slice(1),
                  ]
                  : group.items;

                return (
                  <optgroup key={group.group} label={group.group}>
                    {dynamicOptions.map(item => (
                      item
                        ? <option key={item.id} value={`${DYNAMIC_IMAGE_EFFECT_TYPE_PREFIX}${item.id}`}>{item.label}</option>
                        : <option key="smudgeDistortion" value="smudgeDistortion">涂抹畸变</option>
                    ))}
                    {staticOptions.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </label> : null}
        </PanelGroup>

        {isTextureLayerSelected ? <>

        {isGradientTexture ? <PanelGroup title="渐变色">
            <GradientStopsEditor stops={settings.gradientStops} onChange={gradientStops => updateSettings({ gradientStops })} />
            {isGradientAlgorithm(settings.gradientAnimType) ? null : range('gradientAngle', '渐变方向', 0, 360, 1, value => `${Math.round(value)}°`)}
        </PanelGroup> : null}

        {isDynamicImageTexture ? <PanelGroup title="图像源">
          <input
            ref={dynamicImageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="dynamic-image-file-input"
            onChange={handleDynamicImageFileInput}
          />
          {selectedDynamicImageAsset ? (
            <div className="dynamic-image-uploaded">
              <img src={selectedDynamicImageAsset.objectUrl} alt={selectedDynamicImageAsset.name} />
              <div className="dynamic-image-meta">
                <strong>{selectedDynamicImageAsset.name}</strong>
                <span>{selectedDynamicImageAsset.width} × {selectedDynamicImageAsset.height}</span>
                <span>{formatFileSize(selectedDynamicImageAsset.fileSize)}</span>
              </div>
              <div className="button-row">
                <button
                  type="button"
                  className="wide-button"
                  disabled={isDynamicImageUploading}
                  onClick={() => dynamicImageInputRef.current?.click()}
                >
                  {isDynamicImageUploading ? '处理中...' : '替换图像'}
                </button>
                <button type="button" className="wide-button" onClick={removeSelectedDynamicImage}>移除</button>
              </div>
            </div>
          ) : (
            <label
              className={`dynamic-image-upload-dropzone${isDynamicImageUploading ? ' is-loading' : ''}`}
              onDragOver={event => event.preventDefault()}
              onDrop={handleDynamicImageDrop}
            >
              <strong>{isDynamicImageUploading ? '正在处理图像...' : '上传图像'}</strong>
              <span>从图像生成动态背景</span>
              <button
                type="button"
                className="mini-button"
                disabled={isDynamicImageUploading}
                onClick={() => dynamicImageInputRef.current?.click()}
              >
                选择文件
              </button>
            </label>
          )}
          {dynamicImageUploadError ? <p className="dynamic-image-upload-error">{dynamicImageUploadError}</p> : null}
          {!selectedDynamicImageAsset && settings.dynamicImageAssetId ? (
            <p className="dynamic-image-upload-hint">该图层已有历史图像参数，当前会话需重新上传原图。</p>
          ) : null}
          <label className="input-row">
            <span>填充方式</span>
            <select value={settings.dynamicImageFit} onChange={event => updateSettings({ dynamicImageFit: event.currentTarget.value as TextureSettings['dynamicImageFit'] })}>
              <option value="cover">覆盖裁切（cover）</option>
              <option value="contain">完整显示（contain）</option>
            </select>
          </label>
        </PanelGroup> : null}

        {isDynamicImageTexture ? null : <PanelGroup title={isGradientTexture ? '渐变算法' : '动画参数'}>
          <label className="check-row"><span>启用动画</span><input type="checkbox" checked={settings.animEnabled !== false} onChange={event => updateSettings({ animEnabled: event.currentTarget.checked })} /></label>
          {isHalftoneTexture ? <>
            <label className="input-row"><span>动画类型</span><select value={settings.animType} onChange={event => updateSettings({ animType: event.currentTarget.value as TextureAnimType })}><option value="drift">方向位移</option><option value="breathe">呼吸</option><option value="vortex">漩涡</option><option value="wave">波动</option><option value="float">漂浮</option></select></label>
            {range('speed', '动画速度', 1, 10, 0.01, value => value.toFixed(2))}
            {(settings.animType === 'drift' || settings.animType === 'wave') ? range('directionDeg', '流动方向', 0, 360, 1, value => `${Math.round(value)}°`) : null}
            {(settings.animType === 'drift' || settings.animType === 'vortex') ? range('coherence', '连贯性', 0, 2, 0.01, value => `${value.toFixed(2)} s`) : null}
          </> : isGradientTexture ? <>
            <label className="input-row"><span>渐变算法</span><select value={currentGradientAlgorithm.id} onChange={event => {
              const next = event.currentTarget.value as TextureGradientAnimType;
              const algorithm = getGradientAlgorithmDef(next);
              updateSettings({
                gradientAnimType: algorithm.id,
                ...algorithm.defaults,
                gradientStops: isGrayscaleStops(settings.gradientStops) ? FLOW_DEFAULT_STOPS : settings.gradientStops,
              });
            }}>
              {GRADIENT_ALGORITHM_GROUPS.map(group => (
                <optgroup label={group.group} key={group.group}>
                  {group.items.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}
                </optgroup>
              ))}
            </select></label>
            <>
              {currentGradientAlgorithm.params.map(param => range(
                param.key,
                param.label,
                param.min,
                param.max,
                param.step,
                value => `${param.digits === undefined ? value : param.digits === 0 ? Math.round(value) : value.toFixed(param.digits)}${param.suffix ?? ''}`,
              ))}
            </>
          </> : null}
        </PanelGroup>}

        {isHalftoneTexture ? <PanelGroup title="斑纹参数">
          <label className="input-row"><span>斑纹类型</span><select value={settings.spotType} onChange={event => updateSettings({ spotType: event.currentTarget.value as TextureSpotType })}><option value="gaussian">高斯</option><option value="wave">波纹</option><option value="cellular">细胞</option><option value="ripple">涟漪</option><option value="streak">条纹</option></select></label>
          {range('spotCount', '斑纹数量', 1, 40, 1, value => `${Math.round(value)}`)}
          {range('spotSize', '斑纹大小', 8, 500, 1, value => `${Math.round(value)} px`)}
          {range('spotBlur', '模糊度', 0, 200, 1, value => `${Math.round(value)} px`)}
          {range('randomness', '随机性', 0, 1, 0.01, value => value.toFixed(2))}
          <div className="input-row"><span>斑纹颜色</span><ColorInput value={settings.dotColor} onChange={dotColor => updateSettings({ dotColor })} ariaLabel="编辑斑纹颜色" /></div>
          {range('dotOpacity', '斑纹透明度', 0, 1, 0.01, value => value.toFixed(2))}
          {range('seed', '随机种子', 1, 9999, 1, value => `${Math.round(value)}`)}
          {range('contrast', '对比度', 0.2, 3, 0.01, value => value.toFixed(2))}
          {range('threshold', '显隐阈值', 0, 1, 0.01, value => value.toFixed(2))}
        </PanelGroup> : null}

        {isHalftoneTexture ? <PanelGroup title="点阵样式">
          <label className="check-row"><span>启用点阵</span><input type="checkbox" checked={settings.dotEnabled !== false} onChange={event => updateSettings({ dotEnabled: event.currentTarget.checked })} /></label>
          {settings.dotEnabled !== false ? <>
            {range('dotSpacing', '点阵间距', 6, 36, 0.5, value => `${value.toFixed(1)} px`)}
            <label className="input-row"><span>瓷砖类型</span><select value={settings.dotTileType} onChange={event => updateSettings({ dotTileType: event.currentTarget.value as TextureTileType })}><option value="square">正方形</option><option value="hexagon">六边形</option></select></label>
            {range('dotMinSize', '最小点径', 0.05, 2.5, 0.05, value => `${value.toFixed(2)} px`)}
            {range('dotMaxSize', '最大点径', 0.4, 15, 0.05, value => `${value.toFixed(2)} px`)}
            {range('dotYOffsetMap', 'Y轴映射', 0, 60, 0.5, value => `${value.toFixed(1)} px`)}
            <label className="check-row"><span>启用湍流置换</span><input type="checkbox" checked={settings.dotTurbulenceEnabled} onChange={event => updateSettings({ dotTurbulenceEnabled: event.currentTarget.checked })} /></label>
            {settings.dotTurbulenceEnabled ? <>
              {range('dotTurbulenceStrength', '湍流强度', 0, 80, 0.5, value => `${value.toFixed(1)} px`)}
              {range('dotTurbulenceSmoothness', '平滑度', 8, 480, 1, value => `${Math.round(value)} px`)}
              {range('dotTurbulenceSeed', '湍流种子', 1, 9999, 1, value => `${Math.round(value)}`)}
            </> : null}
            <label className="input-row"><span>点阵图形符号</span><select value={settings.symbol} onChange={event => updateSettings({ symbol: event.currentTarget.value as TextureSettings['symbol'] })}><option value="circle">圆形</option><option value="square">方形</option><option value="diamond">菱形</option><option value="plus">十字</option><option value="star">十字星</option><option value="chars">变化字符</option></select></label>
            {settings.symbol === 'chars' ? <label className="input-row full"><span>变化字符</span><input value={settings.dotSymbolChars} onChange={event => updateSettings({ dotSymbolChars: event.currentTarget.value })} /></label> : null}
          </> : null}
        </PanelGroup> : null}

        {isHalftoneTexture ? <PanelGroup title="边缘与边界">
          {range('fadeEdgeTop', '上边缘渐隐', 0, 2, 0.01, value => value.toFixed(2))}
          {range('fadeEdgeBottom', '下边缘渐隐', 0, 2, 0.01, value => value.toFixed(2))}
          {range('fadeEdgeLeft', '左边缘渐隐', 0, 2, 0.01, value => value.toFixed(2))}
          {range('fadeEdgeRight', '右边缘渐隐', 0, 2, 0.01, value => value.toFixed(2))}
        </PanelGroup> : null}

        {isHalftoneTexture ? <PanelGroup title="鼠标交互">
          <label className="check-row"><span>启用鼠标交互</span><input type="checkbox" checked={settings.mouseInteractive} onChange={event => updateSettings({ mouseInteractive: event.currentTarget.checked })} /></label>
          {settings.mouseInteractive ? <>
            {range('mouseInteractionRadius', '鼠标范围', 10, 200, 1, value => `${Math.round(value)} px`)}
            {range('mouseInteractionArea', '作用区域', 0, 1, 0.01, value => value.toFixed(2))}
            {range('mouseInteractionInitialSpeed', '初频率', 0, 24, 1, value => `${Math.round(value)}/s`)}
            {range('mouseInteractionFinalSpeed', '末频率', 0, 24, 1, value => `${Math.round(value)}/s`)}
            {range('mouseInteractionDuration', '持续时间', 0.2, 6, 0.1, value => `${value.toFixed(1)} s`)}
            <label className="input-row full"><span>变化字符</span><input value={settings.mouseInteractionChars} onChange={event => updateSettings({ mouseInteractionChars: event.currentTarget.value })} /></label>
          </> : null}
        </PanelGroup> : null}

        {isHalftoneTexture ? <PanelGroup title="激活状态">
          <label className="check-row"><span>启用激活状态</span><input type="checkbox" checked={settings.activationEnabled} onChange={event => updateSettings({ activationEnabled: event.currentTarget.checked })} /></label>
          {settings.activationEnabled ? <>
            <label className="check-row"><span>显示纹理</span><input type="checkbox" checked={settings.activationShowTexture} onChange={event => updateSettings({ activationShowTexture: event.currentTarget.checked })} /></label>
            <label className="input-row"><span>纹理类型</span><select value={settings.activationType} onChange={event => updateSettings({ activationType: event.currentTarget.value as TextureActivationType })}><option value="ripple">涟漪</option><option value="pulse">脉冲</option><option value="sweep">扫描</option></select></label>
            {range('activationOffsetX', 'X轴偏移', -500, 500, 1, value => `${Math.round(value)} px`)}
            {range('activationOffsetY', 'Y轴偏移', -500, 500, 1, value => `${Math.round(value)} px`)}
            {range('activationRadiusX', '扩散半径X', 50, 800, 1, value => `${Math.round(value)} px`)}
            {range('activationRadiusY', '扩散半径Y', 50, 800, 1, value => `${Math.round(value)} px`)}
            {settings.activationType === 'ripple' ? range('activationRingWidth', '波环宽度', 10, 300, 1, value => `${Math.round(value)} px`) : null}
            {settings.activationType === 'ripple' ? range('activationRippleInterval', '涟漪频率', 0.1, 4, 0.1, value => `${value.toFixed(1)} s`) : null}
            {range('activationInitialSpeed', '初频率', 0, 24, 1, value => `${Math.round(value)}/s`)}
            {range('activationFinalSpeed', '末频率', 0, 24, 1, value => `${Math.round(value)}/s`)}
            {range('activationDuration', '持续时间', 0.5, 10, 0.1, value => `${value.toFixed(1)} s`)}
            <label className="input-row full"><span>变化字符</span><input value={settings.activationChars} onChange={event => updateSettings({ activationChars: event.currentTarget.value })} /></label>
          </> : null}
        </PanelGroup> : null}

        {isTextureLayerSelected ? <PanelGroup
          title="变换参数"
          headerActions={(
            <button
              type="button"
              className="group-title-action-button"
              disabled={isTextureTransformDefault}
              onClick={() => updateTextureTransform(textureDefaultTransform)}
            >
              恢复默认值
            </button>
          )}
        >
          {transformRange(textureTransform, updateTextureTransform, 'scale', value => value.toFixed(2), textureTransformParamDefs, textureTransformBounds)}
          {transformRange(textureTransform, updateTextureTransform, 'aspectRatio', value => value.toFixed(2), textureTransformParamDefs, textureTransformBounds)}
          {transformRange(textureTransform, updateTextureTransform, 'offsetX', value => `${Math.round(value)} px`, textureTransformParamDefs, textureTransformBounds)}
          {transformRange(textureTransform, updateTextureTransform, 'offsetY', value => `${Math.round(value)} px`, textureTransformParamDefs, textureTransformBounds)}
        </PanelGroup> : null}

        </> : null}

        {isEffectLayerSelected && effectSettings ? <>
          {effectSettings.type === 'smudgeDistortion' ? <>
            <PanelGroup title="绘制">
              <label className="check-row"><span>启用画笔</span><input type="checkbox" checked={effectSettings.brushEnabled} onChange={event => updateSelectedSmudgeEffectSettings({ brushEnabled: event.currentTarget.checked })} /></label>
              {effectRange('brushSize', '画笔大小', 4, 400, 1, value => `${Math.round(value)} px`)}
              {effectRange('brushStrength', '画笔强度', 0, 1, 0.01, value => value.toFixed(2))}
              {effectRange('brushFeather', '画笔柔和度', 0, 400, 1, value => `${Math.round(value)} px`)}
              <div className="button-row">
                <button type="button" className="wide-button" disabled={effectSettings.strokes.length <= 0} onClick={undoSmudgeStroke}>撤销</button>
                <button type="button" className="wide-button" disabled={effectSettings.strokes.length <= 0} onClick={resetSmudgeStrokes}>重置</button>
              </div>
            </PanelGroup>
            <PanelGroup title="效果参数">
              {effectRange('strength', '效果强度', 0, 1, 0.01, value => value.toFixed(2))}
              {effectRange('precision', '精度', 1, 4, 1, value => `${Math.round(value)}x`)}
            </PanelGroup>
          </> : null}
          {effectSettings.type === 'paintMask' ? <>
            <PanelGroup title="绘制">
              <label className="check-row"><span>启用画笔</span><input type="checkbox" checked={effectSettings.brushEnabled} onChange={event => updateSelectedPaintMaskSettings({ brushEnabled: event.currentTarget.checked })} /></label>
              <label className="input-row"><span>蒙版画笔</span><select value={effectSettings.brush} onChange={event => updateSelectedPaintMaskSettings({ brush: event.currentTarget.value as TextureMaskBrush })}><option value="black">黑色：隐藏内容</option><option value="white">白色：恢复显示</option></select></label>
              {paintMaskRange('brushSize', '画笔大小', 4, 400, 1, value => `${Math.round(value)} px`)}
              {paintMaskRange('brushOpacity', '透明度', 0, 1, 0.01, value => value.toFixed(2))}
              {paintMaskRange('brushFeather', '羽化大小', 0, 400, 1, value => `${Math.round(value)} px`)}
              <div className="button-row">
                <button type="button" className="wide-button" disabled={effectSettings.strokes.length <= 0} onClick={undoPaintMaskStroke}>撤销</button>
                <button type="button" className="wide-button" disabled={effectSettings.strokes.length <= 0} onClick={resetPaintMaskStrokes}>重置蒙版</button>
              </div>
            </PanelGroup>
          </> : null}
          {effectSettings.type === 'pixelGrain' ? <>
            <PanelGroup title="效果参数">
              {pixelGrainRange('amount', '像素颗粒', 0, 1, 0.01, value => `${Math.round(value * 100)}`, raw => {
                const parsed = parseLooseNumber(raw);
                if (parsed === null) return null;
                return parsed / 100;
              })}
              <label className="input-row">
                <span>混合模式</span>
                <select
                  value={effectSettings.blendMode}
                  onChange={event => updateSelectedPixelGrainSettings({ blendMode: event.currentTarget.value as PixelGrainBlendMode })}
                >
                  {PIXEL_GRAIN_BLEND_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </PanelGroup>
          </> : null}
          {effectSettings.type === 'outlines' ? <>
            <PanelGroup title="轮廓参数">
              <label className="input-row">
                <span>识别依据</span>
                <select
                  value={effectSettings.inputMode}
                  onChange={event => updateSelectedOutlinesSettings({ inputMode: event.currentTarget.value as OutlinesInputMode })}
                >
                  <option value="luma">亮度</option>
                  <option value="inverseLuma">反向亮度</option>
                  <option value="alpha">透明度</option>
                </select>
              </label>
              {outlinesRange('threshold', '明暗阈值', 0.05, 0.95, 0.01, value => `${Math.round(value * 100)}%`)}
              {outlinesRange('count', '轮廓数量', 2, 24, 1, value => `${Math.round(value)}`)}
              {outlinesRange('thickness', '线条粗细', 0.5, 4, 0.05, value => `${value.toFixed(2)} px`)}
              {outlinesRange('spacing', '轮廓间距', 0.5, 4, 0.05, value => value.toFixed(2))}
              {outlinesRange('softness', '线条柔边', 0, 1, 0.01, value => `${Math.round(value * 100)}%`)}
              {outlinesRange('smoothing', '轮廓平滑', 0, 5, 0.01, value => `${Math.round(value * 13)} px`)}
              {outlinesRange('gaussianSamples', '平滑质量', 3, 9, 2, value => ({ 3: '快速', 5: '标准', 7: '均衡', 9: '精细' }[Math.round(value)] ?? '均衡'))}
              {outlinesRange('offset', '位置偏移', -0.5, 0.5, 0.01, value => `${Math.round(value * 100)}%`)}
              <label className="check-row"><span>启用动画</span><input type="checkbox" checked={effectSettings.animationEnabled} onChange={event => updateSelectedOutlinesSettings({ animationEnabled: event.currentTarget.checked })} /></label>
              {effectSettings.animationEnabled ? outlinesRange('speed', '流动速度', 0, 1.5, 0.01, value => value.toFixed(2)) : null}
            </PanelGroup>
            <PanelGroup title="线条渐变色">
              <GradientStopsEditor
                stops={effectSettings.lineGradientStops}
                onChange={lineGradientStops => updateSelectedOutlinesSettings({ lineGradientStops })}
              />
            </PanelGroup>
          </> : null}
          {effectSettings.type === 'dynamicImageEffect' ? <>
            <PanelGroup title="效果参数">
              {currentDynamicImageEffectAlgorithm.params.map(param => dynamicImageEffectRange(
                param.key === 'dynamicImageSpeed'
                  ? 'speed'
                  : param.key === 'dynamicImageStrength'
                    ? 'strength'
                    : param.key === 'dynamicImageParamA'
                      ? 'paramA'
                      : param.key === 'dynamicImageParamB'
                        ? 'paramB'
                        : 'opacity',
                param.label,
                param.min,
                param.max,
                param.step,
                value => `${param.digits === undefined ? value : param.digits === 0 ? Math.round(value) : value.toFixed(param.digits)}${param.suffix ?? ''}`,
              ))}
            </PanelGroup>
          </> : null}
          {effectTransformEnabled ? <PanelGroup
            title="变换参数"
            headerActions={(
              <button
                type="button"
                className="group-title-action-button"
                disabled={isEffectTransformDefault}
                onClick={() => updateEffectTransform(TRANSFORM_PARAMS_DEFAULTS)}
              >
                恢复默认值
              </button>
            )}
          >
            {transformRange(effectTransform, updateEffectTransform, 'scale', value => value.toFixed(2), TRANSFORM_PARAM_DEFS, TRANSFORM_PARAM_BOUNDS_DEFAULT)}
            {transformRange(effectTransform, updateEffectTransform, 'aspectRatio', value => value.toFixed(2), TRANSFORM_PARAM_DEFS, TRANSFORM_PARAM_BOUNDS_DEFAULT)}
            {transformRange(effectTransform, updateEffectTransform, 'offsetX', value => `${Math.round(value)} px`, TRANSFORM_PARAM_DEFS, TRANSFORM_PARAM_BOUNDS_DEFAULT)}
            {transformRange(effectTransform, updateEffectTransform, 'offsetY', value => `${Math.round(value)} px`, TRANSFORM_PARAM_DEFS, TRANSFORM_PARAM_BOUNDS_DEFAULT)}
          </PanelGroup> : null}
        </> : null}
      </aside>
    </main>
  );
}
