import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ColorInput } from './components/ColorInput';
import { DynamicTextureCanvas, type DynamicTextureCanvasHandle } from './components/DynamicTextureCanvas';
import { drawLayerStackWebGL, type WebGLCompositeLayer } from './webglComposite';
import eyeIcon from './assets/eye.svg';
import eyeClosedIcon from './assets/eye_close.svg';
import {
  TEXTURE_DEFAULTS,
  getTextureDefaults,
  sanitizePaintMaskFilter,
  readPresetFile,
  sanitizeSmudgeDistortionFilter,
  sanitizeTextureFilter,
  sanitizeTextureSettings,
  writePresetFile,
  type GradientColorStop,
  type PaintMaskFilter,
  type PaintMaskStroke,
  type SmudgeDistortionFilter,
  type SmudgeDistortionPoint,
  type SmudgeDistortionStroke,
  type TextureActivationType,
  type TextureAnimType,
  type TextureFilter,
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
  'gradientAnimSpeed' | 'gradientFlowScaleX' | 'gradientFlowScaleY' | 'gradientFlowRotation' | 'gradientFlowWarp' | 'gradientFlowSoftness' |
  'gradientFlowComplexity'
>;

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

interface FilterLayer {
  kind: 'filter';
  id: string;
  name: string;
  visible: boolean;
  filter: TextureFilter;
}

type Layer = TextureLayer | FilterLayer;

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

function createSmudgeFilterLayer(index: number): FilterLayer {
  return {
    kind: 'filter',
    id: `filter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: `滤镜${index}`,
    visible: true,
    filter: sanitizeSmudgeDistortionFilter({
      enabled: true,
      strength: 1,
      precision: 2,
      brushEnabled: true,
      brushSize: 80,
      brushStrength: 0.45,
      brushFeather: 48,
      strokes: [],
    }),
  };
}

function createPaintMaskFilter(): PaintMaskFilter {
  return sanitizePaintMaskFilter({
    enabled: true,
    brushEnabled: true,
    brush: 'black',
    brushSize: 44,
    brushOpacity: 1,
    brushFeather: 10,
    strokes: [],
  });
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
        const layer = item as Partial<Layer> & { settings?: unknown; blendMode?: unknown; filter?: unknown; kind?: unknown; visible?: unknown };
        const id = typeof layer.id === 'string' && layer.id.trim() ? layer.id.trim() : `layer-${index + 1}`;
        const visible = layer.visible !== false;
        if (layer.kind === 'filter') {
          return {
            kind: 'filter',
            id,
            name: typeof layer.name === 'string' && layer.name.trim() ? layer.name.trim() : `滤镜${index + 1}`,
            visible,
            filter: sanitizeTextureFilter(layer.filter),
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

function updateSelectedFilter(layerState: TextureLayerState, update: (layer: FilterLayer) => FilterLayer): TextureLayerState {
  return {
    ...layerState,
    layers: layerState.layers.map(layer => layer.id === layerState.selectedLayerId && layer.kind === 'filter' ? update(layer) : layer),
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
        filter: layer.filter,
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
    return settings.animEnabled !== false && settings.gradientAnimType === 'flow';
  }
  return settings.animEnabled !== false || settings.activationEnabled;
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

function drawLayerStack(
  output: HTMLCanvasElement,
  layers: Layer[],
  layerCanvases: Record<string, DynamicTextureCanvasHandle | null>,
  width: number,
  height: number,
) {
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
      return {
        kind: 'texture',
        id: layer.id,
        blendMode: layer.blendMode,
        canvas: textureSourceCanvases.get(layer.id) ?? null,
      };
    }
    return {
      kind: 'filter',
      id: layer.id,
      filter: layer.filter,
    };
  });
  const hasActiveSmudgeFilter = visibleLayers.some(layer => (
    layer.kind === 'filter' &&
    layer.filter.type === 'smudgeDistortion' &&
    layer.filter.enabled &&
    layer.filter.strength > 0 &&
    layer.filter.strokes.length > 0
  ));
  if (hasActiveSmudgeFilter && drawLayerStackWebGL(output, webglLayers, width, height)) return;

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

    if (!hasDrawnLayer || !layer.filter.enabled) continue;
    if (layer.filter.type === 'smudgeDistortion') {
      if (layer.filter.strength <= 0 || layer.filter.strokes.length === 0) continue;
      applySmudgeDistortion(outputCtx, width, height, layer.filter);
      continue;
    }
    if (layer.filter.strokes.length === 0) continue;
    applyPaintMask(outputCtx, width, height, layer.filter);
  }
  outputCtx.globalCompositeOperation = 'source-over';
  outputCtx.globalAlpha = 1;
}

function smudgeFieldKey(filter: SmudgeDistortionFilter, width: number, height: number) {
  return `${width}x${height}:${filter.strength}:${filter.precision}:${filter.strokes.map(stroke => (
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

function buildSmudgeField(filter: SmudgeDistortionFilter, width: number, height: number, precision: number) {
  const key = smudgeFieldKey(filter, width, height);
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
  const dxField = new Float32Array(fieldWidth * fieldHeight);
  const dyField = new Float32Array(fieldWidth * fieldHeight);

  for (const stroke of filter.strokes) {
    const radius = Math.max(2, stroke.brushSize / 2) * precision;
    const feather = Math.max(0, stroke.brushFeather) * precision;
    const spread = radius + feather;
    const inner = Math.max(0, radius - feather);
    const force = stroke.brushStrength * filter.strength * 0.34;
    if (force <= 0 || spread <= 0) continue;

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

  smudgeFieldCache = { key, fieldWidth, fieldHeight, dxField, dyField };
  return smudgeFieldCache;
}

function applySmudgeDistortion(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  filter: SmudgeDistortionFilter,
) {
  const source = ctx.getImageData(0, 0, width, height);
  const output = ctx.createImageData(width, height);
  const src = source.data;
  const dst = output.data;
  const maxDim = Math.max(width, height);
  const precision = Math.max(1, Math.min(4, Math.round(filter.precision)));
  const fieldWidth = width * precision;
  const fieldHeight = height * precision;
  const { dxField, dyField } = buildSmudgeField(filter, width, height, precision);

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
  filter: PaintMaskFilter,
) {
  if (!filter.enabled || filter.strokes.length === 0) return;
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

  for (const stroke of filter.strokes) {
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

function PanelGroup({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="panel-group">
      <button className="group-title" type="button" onClick={() => setOpen(value => !value)}>
        <span>{title}</span>
        <span className={open ? 'chevron open' : 'chevron'}>⌄</span>
      </button>
      {open ? <div className="group-body">{children}</div> : null}
    </section>
  );
}

function GradientStopsEditor({ stops, onChange }: { stops: GradientColorStop[]; onChange: (stops: GradientColorStop[]) => void }) {
  const sorted = useMemo(() => [...stops].sort((a, b) => a.position - b.position), [stops]);
  const sortedRef = useRef(sorted);
  const previewRef = useRef<HTMLDivElement>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const gradient = `linear-gradient(90deg, ${sorted.map(stop => `${stop.color}${Math.round(stop.opacity * 255).toString(16).padStart(2, '0')} ${(stop.position * 100).toFixed(1)}%`).join(', ')})`;
  const getStopKey = (stop: GradientColorStop, index: number) => `${index}-${stop.position.toFixed(4)}`;

  useEffect(() => {
    sortedRef.current = sorted;
  }, [sorted]);

  const getBoundedPosition = (index: number, position: number) => {
    const prev = index > 0 ? sortedRef.current[index - 1]?.position ?? 0 : 0;
    const next = index < sortedRef.current.length - 1 ? sortedRef.current[index + 1]?.position ?? 1 : 1;
    const min = index > 0 ? prev + 0.001 : 0;
    const max = index < sortedRef.current.length - 1 ? next - 0.001 : 1;
    return clamp(position, min, max);
  };

  const updateStop = (index: number, patch: Partial<GradientColorStop>) => {
    const next = sortedRef.current.map((stop, i) => i === index ? { ...stop, ...patch } : stop).sort((a, b) => a.position - b.position);
    onChange(next);
  };

  useEffect(() => {
    if (draggingIndex === null) return;

    const handlePointerMove = (event: PointerEvent) => {
      const preview = previewRef.current;
      if (!preview) return;
      const rect = preview.getBoundingClientRect();
      if (rect.width <= 0) return;
      const raw = (event.clientX - rect.left) / rect.width;
      updateStop(draggingIndex, { position: getBoundedPosition(draggingIndex, raw) });
    };

    const handlePointerUp = () => setDraggingIndex(null);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [draggingIndex]);

  return (
    <div className="gradient-editor">
      <div className="gradient-preview-wrap">
        <div className="gradient-preview" ref={previewRef} style={{ background: gradient }}>
          {sorted.map((stop, index) => (
            <button
              type="button"
              key={getStopKey(stop, index)}
              className={draggingIndex === index ? 'gradient-stop-handle active' : 'gradient-stop-handle'}
              style={{ left: `${stop.position * 100}%`, '--stop-color': stop.color } as React.CSSProperties & { '--stop-color': string }}
              onPointerDown={event => {
                event.preventDefault();
                setDraggingIndex(index);
              }}
              aria-label={`拖动颜色节点 ${index + 1}`}
            />
          ))}
        </div>
      </div>
      {sorted.map((stop, index) => (
        <div className="stop-row" key={getStopKey(stop, index)}>
          <ColorInput value={stop.color} onChange={color => updateStop(index, { color })} ariaLabel={`编辑颜色节点 ${index + 1}`} />
          <label>
            <span>位置</span>
            <div className="stop-position-input">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={Math.round(stop.position * 100)}
                onChange={event => {
                  if (Number.isNaN(event.currentTarget.valueAsNumber)) return;
                  updateStop(index, { position: getBoundedPosition(index, event.currentTarget.valueAsNumber / 100) });
                }}
              />
              <span>%</span>
            </div>
          </label>
          <label>
            <span>透明度</span>
            <input type="range" min={0} max={1} step={0.01} value={stop.opacity} onChange={event => updateStop(index, { opacity: Number(event.currentTarget.value) })} />
          </label>
          <button type="button" disabled={sorted.length <= 2} onClick={() => onChange(sorted.filter((_, i) => i !== index))}>删除</button>
        </div>
      ))}
      <button type="button" className="wide-button" disabled={sorted.length >= 8} onClick={() => onChange([...sorted, { position: 0.5, color: '#ffffff', opacity: 1 }].sort((a, b) => a.position - b.position))}>
        添加颜色
      </button>
    </div>
  );
}

export default function App() {
  const [layerState, setLayerState] = useState<TextureLayerState>(() => loadLocalLayerState());
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
  const selectedFilterLayer = selectedLayer?.kind === 'filter' ? selectedLayer : null;
  const settings = selectedTextureLayer?.settings ?? TEXTURE_DEFAULTS;
  const filterSettings = selectedFilterLayer?.filter ?? null;
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
      setSelectedId(file.selectedId);
      selectedIdRef.current = file.selectedId;
      const selected = file.presets.find(preset => preset.id === file.selectedId);
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
  const hasContinuousComposite = useMemo(
    () => layerState.layers.some(layer => layer.kind === 'texture' && layer.visible !== false && textureNeedsContinuousComposite(layer.settings)),
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
    const sourceVersions = layerState.layers.map(layer => {
      if (layer.kind === 'filter') return `${layer.id}:filter:${layer.visible}`;
      return `${layer.id}:${layer.visible}:${layerCanvasRefs.current[layer.id]?.getFrameVersion() ?? 0}`;
    }).join('|');
    const signature = `${canvasWidth}x${canvasHeight}:${compositeLayerSignature}:${sourceVersions}`;
    if (signature === lastCompositeSignatureRef.current) return;
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
  }, [canvasHeight, canvasWidth, compositeLayerSignature, layerState.layers, markCanvasActivity]);

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
    if (!hasContinuousComposite) return;
    let frame = 0;
    const tick = () => {
      drawComposite();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [drawComposite, hasContinuousComposite]);

  useEffect(() => {
    return () => {
      if (compositeFrameRef.current) cancelAnimationFrame(compositeFrameRef.current);
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
  const isFilterLayerSelected = selectedLayer?.kind === 'filter';
  const isHalftoneTexture = isTextureLayerSelected && settings.textureType === 'halftone';
  const isGradientTexture = isTextureLayerSelected && settings.textureType === 'gradient';
  const currentTextureDefaults = useMemo(
    () => getTextureDefaults(settings.textureType),
    [settings.textureType],
  );

  const range = (key: NumberKey, label: string, min: number, max: number, step: number, format: (value: number) => string = value => String(value)) => {
    const value = Number(settings[key]);
    return (
      <label className="field" key={key}>
        <span><span>{label}</span><b>{format(value)}</b></span>
        <input type="range" min={min} max={max} step={step} value={value} onChange={event => updateSettings({ [key]: Number(event.currentTarget.value) })} />
      </label>
    );
  };

  const setSelectedFilterState = (nextFilter: TextureFilter) => {
    beginCanvasUpdate();
    setLayerState(prev => updateSelectedFilter(prev, layer => ({
      ...layer,
      filter: sanitizeTextureFilter(nextFilter),
    })));
  };

  const updateSelectedSmudgeFilterSettings = (patch: Partial<SmudgeDistortionFilter>) => {
    if (!filterSettings || filterSettings.type !== 'smudgeDistortion') return;
    setSelectedFilterState({ ...filterSettings, ...patch });
  };

  const updateSelectedPaintMaskSettings = (patch: Partial<PaintMaskFilter>) => {
    if (!filterSettings || filterSettings.type !== 'paintMask') return;
    setSelectedFilterState({ ...filterSettings, ...patch });
  };

  const filterRange = (
    key: Extract<keyof SmudgeDistortionFilter, 'strength' | 'precision' | 'brushSize' | 'brushStrength' | 'brushFeather'>,
    label: string,
    min: number,
    max: number,
    step: number,
    format: (value: number) => string = value => String(value),
  ) => {
    const value = Number(filterSettings && filterSettings.type === 'smudgeDistortion' ? filterSettings[key] : 0);
    return (
      <label className="field" key={key}>
        <span><span>{label}</span><b>{format(value)}</b></span>
        <input type="range" min={min} max={max} step={step} value={value} onChange={event => updateSelectedSmudgeFilterSettings({ [key]: Number(event.currentTarget.value) })} />
      </label>
    );
  };

  const paintMaskRange = (
    key: Extract<keyof PaintMaskFilter, 'brushSize' | 'brushOpacity' | 'brushFeather'>,
    label: string,
    min: number,
    max: number,
    step: number,
    format: (value: number) => string = value => String(value),
  ) => {
    const value = Number(filterSettings && filterSettings.type === 'paintMask' ? filterSettings[key] : 0);
    return (
      <label className="field" key={key}>
        <span><span>{label}</span><b>{format(value)}</b></span>
        <input type="range" min={min} max={max} step={step} value={value} onChange={event => updateSelectedPaintMaskSettings({ [key]: Number(event.currentTarget.value) })} />
      </label>
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
    const nextId = nextValue || null;
    if (!confirmPresetSwitch(nextId)) return;
    if (!nextValue) {
      selectedIdRef.current = null;
      setSelectedId(null);
      return;
    }
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
    const preset = presets.find(item => item.id === selectedId);
    if (!preset) return;
    const confirmed = window.confirm(`确定删除预设「${preset.name}」吗？此操作无法撤销。`);
    if (!confirmed) return;
    const nextPresets = presets.filter(preset => preset.id !== selectedId);
    const file = await writePresetFile({ selectedId: null, presets: nextPresets });
    setPresets(file.presets);
    setSelectedId(null);
    selectedIdRef.current = null;
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

  const addFilterLayer = () => {
    setLayerState(prev => {
      const nextLayer = createSmudgeFilterLayer(prev.layers.filter(layer => layer.kind === 'filter').length + 1);
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

  const updateFilterLayer = (id: string, patch: Partial<Pick<FilterLayer, 'name' | 'visible' | 'filter'>>) => {
    setLayerState(prev => ({
      ...prev,
      layers: prev.layers.map(layer => (
        layer.id === id && layer.kind === 'filter'
          ? {
              ...layer,
              ...patch,
              filter: patch.filter ? sanitizeTextureFilter(patch.filter) : layer.filter,
            }
          : layer
      )),
    }));
  };

  const changeSelectedFilterType = (nextType: TextureFilter['type']) => {
    if (!selectedFilterLayer) return;
    updateFilterLayer(selectedFilterLayer.id, {
      filter: nextType === 'paintMask'
        ? createPaintMaskFilter()
        : sanitizeSmudgeDistortionFilter({
            enabled: true,
            strength: 1,
            precision: 2,
            brushEnabled: true,
            brushSize: 80,
            brushStrength: 0.45,
            brushFeather: 48,
            strokes: [],
          }),
    });
  };

  const deleteLayer = (id: string) => {
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

  const syncFilterBrushPreview = (point: SmudgeDistortionPoint | null) => {
    const preview = smudgeBrushPreviewRef.current;
    const inner = smudgeBrushPreviewInnerRef.current;
    if (!preview || !inner || !filterSettings || !point) {
      if (preview) preview.style.opacity = '0';
      return;
    }
    const isBrushEnabled = filterSettings.brushEnabled;
    if (!isBrushEnabled) {
      preview.style.opacity = '0';
      return;
    }
    const size = Math.max(4, filterSettings.brushSize);
    const feather = Math.max(0, filterSettings.brushFeather);
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
    if (filterSettings.type === 'paintMask') {
      const opacity = Math.max(0, Math.min(1, filterSettings.brushOpacity));
      preview.style.borderColor = filterSettings.brush === 'white' ? 'rgba(17,24,39,0.8)' : 'rgba(255,255,255,0.95)';
      preview.style.background = filterSettings.brush === 'white'
        ? `rgba(255,255,255,${Math.max(0.04, opacity * 0.14)})`
        : `rgba(0,0,0,${Math.max(0.04, opacity * 0.14)})`;
      preview.style.boxShadow = filterSettings.brush === 'white'
        ? '0 0 0 1px rgba(255,255,255,0.6)'
        : '0 0 0 1px rgba(0,0,0,0.35)';
      inner.style.opacity = feather > 0 ? `${Math.max(0.15, opacity * 0.85)}` : '0';
      inner.style.borderColor = filterSettings.brush === 'white' ? 'rgba(17,24,39,0.45)' : 'rgba(255,255,255,0.55)';
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
      setLayerState(prev => updateSelectedFilter(prev, layer => {
        if (layer.filter.type !== 'smudgeDistortion') return layer;
        return {
          ...layer,
          filter: sanitizeSmudgeDistortionFilter({
            ...layer.filter,
            strokes: [...layer.filter.strokes, stroke].slice(-80),
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
      setLayerState(prev => updateSelectedFilter(prev, layer => {
        if (layer.filter.type !== 'paintMask') return layer;
        return {
          ...layer,
          filter: sanitizePaintMaskFilter({
            ...layer.filter,
            strokes: [...layer.filter.strokes, stroke].slice(-80),
          }),
        };
      }));
    }, 30);
  };

  const beginSmudgeStroke = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!filterSettings || filterSettings.type !== 'smudgeDistortion' || !filterSettings.brushEnabled || event.button !== 0) return;
    event.preventDefault();
    const point = eventToCanvasPoint(event);
    const stroke: SmudgeDistortionStroke = {
      points: [point],
      brushSize: filterSettings.brushSize,
      brushStrength: filterSettings.brushStrength,
      brushFeather: filterSettings.brushFeather,
    };
    smudgePaintingRef.current = true;
    smudgeStrokeRef.current = stroke;
    lastSmudgePointRef.current = point;
    syncFilterBrushPreview(point);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const beginPaintMaskStroke = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!filterSettings || filterSettings.type !== 'paintMask' || !filterSettings.brushEnabled || event.button !== 0) return;
    event.preventDefault();
    const point = eventToCanvasPoint(event);
    const stroke: PaintMaskStroke = {
      points: [point],
      brush: filterSettings.brush,
      brushSize: filterSettings.brushSize,
      brushOpacity: filterSettings.brushOpacity,
      brushFeather: filterSettings.brushFeather,
    };
    paintMaskPaintingRef.current = true;
    paintMaskStrokeRef.current = stroke;
    lastPaintMaskPointRef.current = point;
    syncFilterBrushPreview(point);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveSmudgeStroke = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = eventToCanvasPoint(event);
    syncFilterBrushPreview(point);
    if (!smudgePaintingRef.current || !smudgeStrokeRef.current) return;
    event.preventDefault();
    const last = lastSmudgePointRef.current;
    if (last && pointDistance(last, point, canvasWidth, canvasHeight) < 2) return;
    smudgeStrokeRef.current.points = [...smudgeStrokeRef.current.points, point].slice(-400);
    lastSmudgePointRef.current = point;
  };

  const movePaintMaskStroke = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = eventToCanvasPoint(event);
    syncFilterBrushPreview(point);
    if (!paintMaskPaintingRef.current || !paintMaskStrokeRef.current) return;
    event.preventDefault();
    const last = lastPaintMaskPointRef.current;
    if (last && pointDistance(last, point, canvasWidth, canvasHeight) < 2) return;
    paintMaskStrokeRef.current.points = [...paintMaskStrokeRef.current.points, point].slice(-400);
    lastPaintMaskPointRef.current = point;
  };

  const undoSmudgeStroke = () => {
    if (!filterSettings || filterSettings.type !== 'smudgeDistortion') return;
    updateSelectedSmudgeFilterSettings({ strokes: filterSettings.strokes.slice(0, -1) });
  };

  const resetSmudgeStrokes = () => {
    updateSelectedSmudgeFilterSettings({ strokes: [] });
  };

  const undoPaintMaskStroke = () => {
    if (!filterSettings || filterSettings.type !== 'paintMask') return;
    updateSelectedPaintMaskSettings({ strokes: filterSettings.strokes.slice(0, -1) });
  };

  const resetPaintMaskStrokes = () => {
    updateSelectedPaintMaskSettings({ strokes: [] });
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
                  width={canvasWidth}
                  height={canvasHeight}
                  layerId={layer.id}
                  onFrame={requestCompositeDraw}
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
            {isFilterLayerSelected && filterSettings?.brushEnabled ? (
              <div
                className="smudge-input-layer"
                onPointerDown={event => {
                  if (filterSettings.type === 'paintMask') beginPaintMaskStroke(event);
                  else beginSmudgeStroke(event);
                }}
                onPointerMove={event => {
                  if (filterSettings.type === 'paintMask') movePaintMaskStroke(event);
                  else moveSmudgeStroke(event);
                }}
                onPointerUp={event => {
                  if (filterSettings.type === 'paintMask') commitPaintMaskStroke();
                  else commitSmudgeStroke();
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onPointerCancel={event => {
                  if (filterSettings.type === 'paintMask') commitPaintMaskStroke();
                  else commitSmudgeStroke();
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onPointerLeave={() => syncFilterBrushPreview(null)}
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
          <label className="input-row"><span>宽度</span><input type="text" inputMode="numeric" value={canvasWidthInput} style={{ width: 128 }} onChange={event => setCanvasWidthInput(event.currentTarget.value)} onBlur={() => commitCanvasDimension(canvasWidthInput, canvasWidth, setCanvasWidth, setCanvasWidthInput)} /></label>
          <label className="input-row"><span>高度</span><input type="text" inputMode="numeric" value={canvasHeightInput} style={{ width: 128 }} onChange={event => setCanvasHeightInput(event.currentTarget.value)} onBlur={() => commitCanvasDimension(canvasHeightInput, canvasHeight, setCanvasHeight, setCanvasHeightInput)} /></label>
          <div className="input-row"><span>预览颜色</span><ColorInput value={previewColor} onChange={setPreviewColor} ariaLabel="编辑画布预览颜色" /></div>
          <button type="button" className="wide-button" onClick={exportCurrentImage}>导出图片</button>
        </PanelGroup>

        <PanelGroup title="纹理预设">
          <div className="button-row preset-actions">
            <button type="button" className="wide-button" onClick={savePreset}>保存为新预设</button>
            <button type="button" className="save-button" disabled={!selectedPreset || !hasUnsavedChanges} onClick={saveCurrentPreset}>保存</button>
          </div>
          <select
            value={selectedId || ''}
            onChange={event => handlePresetChange(event.currentTarget.value)}
          >
            <option value="">自定义</option>
            {presets.map(preset => (
              <option key={preset.id} value={preset.id}>
                {preset.name}{selectedId === preset.id && hasUnsavedChanges ? '*' : ''}
              </option>
            ))}
          </select>
          <div className="button-row preset-manage-row">
            <button type="button" className="wide-button" disabled={!selectedId} onClick={renamePreset}>重命名</button>
            <button type="button" className="wide-button" disabled={!selectedPreset || !hasUnsavedChanges} onClick={resetPreset}>重置</button>
            <button type="button" className="danger-button" disabled={!selectedId} onClick={deletePreset}>删除</button>
          </div>
        </PanelGroup>

        <PanelGroup title="纹理层">
          <div className="layer-add-row">
            <button type="button" className="add-layer-button" onClick={addLayer}>新建图层 +</button>
            <button type="button" className="add-layer-button" onClick={addFilterLayer}>新建滤镜 +</button>
          </div>
          <div className="texture-layer-list">
            {displayedLayers.map(layer => (
              <div
                className={`texture-layer-row ${layer.kind === 'filter' ? 'filter-layer-row' : ''} ${layer.visible === false ? 'hidden-layer' : ''} ${layer.id === layerState.selectedLayerId ? 'active' : ''} ${layer.id === draggingLayerId ? 'dragging' : ''}`}
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
                  aria-label={layer.kind === 'filter' ? '滤镜名称' : '图层名称'}
                  value={layer.name}
                  onChange={event => {
                    if (layer.kind === 'filter') updateFilterLayer(layer.id, { name: event.currentTarget.value });
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
                    if (layer.kind === 'filter') updateFilterLayer(layer.id, { visible: layer.visible === false });
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
            <span>纹理类型</span>
            <select
              value={settings.textureType}
              onChange={event => {
                const textureType = event.currentTarget.value as TextureType;
                replaceSettings(getTextureDefaults(textureType));
              }}
            >
              <option value="halftone">半调点阵</option>
              <option value="gradient">渐变背景</option>
            </select>
          </label> : null}
          {isFilterLayerSelected && filterSettings ? <label className="input-row selected-layer-type-row">
            <span>滤镜类型</span>
            <select value={filterSettings.type} onChange={event => changeSelectedFilterType(event.currentTarget.value as TextureFilter['type'])}>
              <option value="smudgeDistortion">涂抹畸变</option>
              <option value="paintMask">绘制蒙版</option>
            </select>
          </label> : null}
        </PanelGroup>

        {isTextureLayerSelected ? <>

        <PanelGroup title="动画参数">
          <label className="check-row"><span>启用动画</span><input type="checkbox" checked={settings.animEnabled !== false} onChange={event => updateSettings({ animEnabled: event.currentTarget.checked })} /></label>
          {isHalftoneTexture ? <>
            <label className="input-row"><span>动画类型</span><select value={settings.animType} onChange={event => updateSettings({ animType: event.currentTarget.value as TextureAnimType })}><option value="drift">方向位移</option><option value="breathe">呼吸</option><option value="vortex">漩涡</option><option value="wave">波动</option><option value="float">漂浮</option></select></label>
            {range('speed', '动画速度', 1, 10, 0.01, value => value.toFixed(2))}
            {(settings.animType === 'drift' || settings.animType === 'wave') ? range('directionDeg', '流动方向', 0, 360, 1, value => `${Math.round(value)}°`) : null}
            {(settings.animType === 'drift' || settings.animType === 'vortex') ? range('coherence', '连贯性', 0, 2, 0.01, value => `${value.toFixed(2)} s`) : null}
          </> : <>
            <label className="input-row"><span>动画类型</span><select value={settings.gradientAnimType} onChange={event => {
              const next = event.currentTarget.value as TextureGradientAnimType;
              updateSettings({ gradientAnimType: next, gradientStops: next !== 'none' && isGrayscaleStops(settings.gradientStops) ? FLOW_DEFAULT_STOPS : settings.gradientStops });
            }}><option value="none">无（静态）</option><option value="flow">流动渐变</option></select></label>
            {settings.gradientAnimType === 'flow' ? <>
              {range('gradientAnimSpeed', '流动速度', 0.01, 1, 0.01, value => value.toFixed(2))}
              {range('gradientFlowScaleX', '纹理缩放 X', 0.01, 1, 0.01, value => value.toFixed(2))}
              {range('gradientFlowScaleY', '纹理缩放 Y', 0.01, 1, 0.01, value => value.toFixed(2))}
              {range('gradientFlowRotation', '旋转纹理', 0, 360, 1, value => `${Math.round(value)}°`)}
              {range('gradientFlowComplexity', '复杂度', 1, 6, 1, value => `${Math.round(value)}`)}
              {range('gradientFlowWarp', '扭曲强度', 0, 6, 0.1, value => value.toFixed(1))}
              {range('gradientFlowSoftness', '柔和度', 0, 1, 0.01, value => value.toFixed(2))}
            </> : null}
          </>}
        </PanelGroup>

        {isHalftoneTexture ? <PanelGroup title="斑纹参数">
          <label className="input-row"><span>斑纹类型</span><select value={settings.spotType} onChange={event => updateSettings({ spotType: event.currentTarget.value as TextureSpotType })}><option value="gaussian">高斯</option><option value="wave">波纹</option><option value="cellular">细胞</option><option value="ripple">涟漪</option><option value="streak">条纹</option></select></label>
          {range('spotCount', '斑纹数量', 1, 40, 1, value => `${Math.round(value)}`)}
          {range('spotSize', '斑纹大小', 8, 500, 1, value => `${Math.round(value)} px`)}
          {range('spotBlur', '模糊度', 0, 200, 1, value => `${Math.round(value)} px`)}
          {range('randomness', '随机性', 0, 1, 0.01, value => value.toFixed(2))}
          <div className="input-row"><span>斑纹颜色</span><ColorInput value={settings.dotColor} onChange={dotColor => updateSettings({ dotColor })} ariaLabel="编辑斑纹颜色" /></div>
          {range('dotOpacity', '斑纹透明度', 0, 1, 0.01, value => value.toFixed(2))}
          {range('seed', '随机种子', 1, 9999, 1, value => `${Math.round(value)}`)}
          {range('spotScale', '整体缩放', 0.1, 10, 0.1, value => value.toFixed(1))}
          {range('spotOffsetX', 'X轴偏移', -400, 400, 1, value => `${Math.round(value)} px`)}
          {range('spotOffsetY', 'Y轴偏移', -400, 400, 1, value => `${Math.round(value)} px`)}
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

        {isGradientTexture ? <PanelGroup title="渐变背景">
            <GradientStopsEditor stops={settings.gradientStops} onChange={gradientStops => updateSettings({ gradientStops })} />
            {settings.gradientAnimType === 'flow' ? null : range('gradientAngle', '渐变方向', 0, 360, 1, value => `${Math.round(value)}°`)}
            {range('gradientFadeEdgeTop', '上边缘渐隐', 0, 2, 0.01, value => value.toFixed(2))}
            {range('gradientFadeEdgeBottom', '下边缘渐隐', 0, 2, 0.01, value => value.toFixed(2))}
            {range('gradientFadeEdgeLeft', '左边缘渐隐', 0, 2, 0.01, value => value.toFixed(2))}
            {range('gradientFadeEdgeRight', '右边缘渐隐', 0, 2, 0.01, value => value.toFixed(2))}
        </PanelGroup> : null}

        <button type="button" className="wide-button reset" onClick={() => replaceSettings(currentTextureDefaults)}>恢复纹理默认参数</button>
        </> : null}

        {isFilterLayerSelected && filterSettings ? <>
          {filterSettings.type === 'smudgeDistortion' ? <>
            <PanelGroup title="绘制">
              <label className="check-row"><span>启用画笔</span><input type="checkbox" checked={filterSettings.brushEnabled} onChange={event => updateSelectedSmudgeFilterSettings({ brushEnabled: event.currentTarget.checked })} /></label>
              {filterRange('brushSize', '画笔大小', 4, 400, 1, value => `${Math.round(value)} px`)}
              {filterRange('brushStrength', '画笔强度', 0, 1, 0.01, value => value.toFixed(2))}
              {filterRange('brushFeather', '画笔柔和度', 0, 400, 1, value => `${Math.round(value)} px`)}
              <div className="button-row">
                <button type="button" className="wide-button" disabled={filterSettings.strokes.length <= 0} onClick={undoSmudgeStroke}>撤销</button>
                <button type="button" className="wide-button" disabled={filterSettings.strokes.length <= 0} onClick={resetSmudgeStrokes}>重置</button>
              </div>
            </PanelGroup>
            <PanelGroup title="滤镜参数">
              <label className="check-row"><span>启用滤镜</span><input type="checkbox" checked={filterSettings.enabled} onChange={event => updateSelectedSmudgeFilterSettings({ enabled: event.currentTarget.checked })} /></label>
              {filterRange('strength', '滤镜强度', 0, 1, 0.01, value => value.toFixed(2))}
              {filterRange('precision', '精度', 1, 4, 1, value => `${Math.round(value)}x`)}
            </PanelGroup>
          </> : null}
          {filterSettings.type === 'paintMask' ? <>
            <PanelGroup title="绘制">
              <label className="check-row"><span>启用画笔</span><input type="checkbox" checked={filterSettings.brushEnabled} onChange={event => updateSelectedPaintMaskSettings({ brushEnabled: event.currentTarget.checked })} /></label>
              <label className="input-row"><span>蒙版画笔</span><select value={filterSettings.brush} onChange={event => updateSelectedPaintMaskSettings({ brush: event.currentTarget.value as TextureMaskBrush })}><option value="black">黑色：隐藏内容</option><option value="white">白色：恢复显示</option></select></label>
              {paintMaskRange('brushSize', '画笔大小', 4, 400, 1, value => `${Math.round(value)} px`)}
              {paintMaskRange('brushOpacity', '透明度', 0, 1, 0.01, value => value.toFixed(2))}
              {paintMaskRange('brushFeather', '羽化大小', 0, 400, 1, value => `${Math.round(value)} px`)}
              <div className="button-row">
                <button type="button" className="wide-button" disabled={filterSettings.strokes.length <= 0} onClick={undoPaintMaskStroke}>撤销</button>
                <button type="button" className="wide-button" disabled={filterSettings.strokes.length <= 0} onClick={resetPaintMaskStrokes}>重置蒙版</button>
              </div>
            </PanelGroup>
            <PanelGroup title="滤镜参数">
              <label className="check-row"><span>启用滤镜</span><input type="checkbox" checked={filterSettings.enabled} onChange={event => updateSelectedPaintMaskSettings({ enabled: event.currentTarget.checked })} /></label>
            </PanelGroup>
          </> : null}
        </> : null}
      </aside>
    </main>
  );
}
