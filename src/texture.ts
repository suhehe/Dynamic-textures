import bundledPresetFile from '../data/texture-presets.json';

export type TextureSymbol = 'circle' | 'square' | 'diamond' | 'plus' | 'star' | 'chars';
export type TextureSpotType = 'gaussian' | 'wave' | 'cellular' | 'ripple' | 'streak';
export type TextureAnimType = 'drift' | 'breathe' | 'vortex' | 'wave' | 'float';
export type TextureActivationType = 'ripple' | 'pulse' | 'sweep';
export type TextureGradientAnimType = 'none' | 'flow';
export type TextureTileType = 'square' | 'hexagon';
export type TextureMaskBrush = 'black' | 'white';
export type TextureType = 'halftone' | 'gradient';

export interface GradientColorStop {
  position: number;
  color: string;
  opacity: number;
}

export interface TextureSettings {
  textureType: TextureType;
  enabled: boolean;
  animEnabled: boolean;
  animType: TextureAnimType;
  speed: number;
  directionDeg: number;
  coherence: number;
  spotCount: number;
  spotSize: number;
  spotBlur: number;
  spotType: TextureSpotType;
  spotScale: number;
  spotOffsetX: number;
  spotOffsetY: number;
  spotMaskEnabled: boolean;
  spotMaskBrush: TextureMaskBrush;
  spotMaskBrushSize: number;
  spotMaskBrushOpacity: number;
  spotMaskFeather: number;
  randomness: number;
  dotEnabled: boolean;
  dotColor: string;
  dotOpacity: number;
  dotSpacing: number;
  dotTileType: TextureTileType;
  dotMinSize: number;
  dotMaxSize: number;
  dotYOffsetMap: number;
  dotTurbulenceEnabled: boolean;
  dotTurbulenceStrength: number;
  dotTurbulenceSmoothness: number;
  dotTurbulenceSeed: number;
  contrast: number;
  threshold: number;
  fadeEdgeTop: number;
  fadeEdgeBottom: number;
  fadeEdgeLeft: number;
  fadeEdgeRight: number;
  symbol: TextureSymbol;
  dotSymbolChars: string;
  seed: number;
  mouseInteractive: boolean;
  mouseInteractionRadius: number;
  mouseInteractionInitialSpeed: number;
  mouseInteractionFinalSpeed: number;
  mouseInteractionDuration: number;
  mouseInteractionArea: number;
  mouseInteractionChars: string;
  activationEnabled: boolean;
  activationShowTexture: boolean;
  activationType: TextureActivationType;
  activationOffsetX: number;
  activationOffsetY: number;
  activationRadiusX: number;
  activationRadiusY: number;
  activationInitialSpeed: number;
  activationFinalSpeed: number;
  activationDuration: number;
  activationRippleInterval: number;
  activationRingWidth: number;
  activationChars: string;
  gradientEnabled: boolean;
  gradientStops: GradientColorStop[];
  gradientAngle: number;
  gradientFadeEdgeTop: number;
  gradientFadeEdgeBottom: number;
  gradientFadeEdgeLeft: number;
  gradientFadeEdgeRight: number;
  gradientAnimType: TextureGradientAnimType;
  gradientFlowScaleX: number;
  gradientFlowScaleY: number;
  gradientFlowRotation: number;
  gradientFlowWarp: number;
  gradientFlowSoftness: number;
  gradientFlowComplexity: number;
  gradientAnimEnabled: boolean;
  gradientAnimSpeed: number;
  gradientAnimIntensity: number;
  gradientAnimDirection: number;
}

export interface TexturePreset {
  id: string;
  name: string;
  settings: TextureSettings;
  layerState: TexturePresetLayerState;
  createdAt: string;
  updatedAt: string;
}

export interface SmudgeDistortionPoint {
  x: number;
  y: number;
}

export interface SmudgeDistortionStroke {
  points: SmudgeDistortionPoint[];
  brushSize: number;
  brushStrength: number;
  brushFeather: number;
}

export interface SmudgeDistortionFilter {
  type: 'smudgeDistortion';
  enabled: boolean;
  strength: number;
  brushEnabled: boolean;
  brushSize: number;
  brushStrength: number;
  brushFeather: number;
  strokes: SmudgeDistortionStroke[];
}

export interface TexturePresetTextureLayer {
  id: string;
  kind: 'texture';
  name: string;
  settings: TextureSettings;
  blendMode: string;
}

export interface TexturePresetFilterLayer {
  id: string;
  kind: 'filter';
  name: string;
  filter: SmudgeDistortionFilter;
}

export type TexturePresetLayer = TexturePresetTextureLayer | TexturePresetFilterLayer;

export interface TexturePresetLayerState {
  layers: TexturePresetLayer[];
  selectedLayerId: string;
}

export interface TexturePresetFile {
  selectedId: string | null;
  presets: TexturePreset[];
}

const PRESET_STORAGE_KEY = 'dynamic-textures.presets.v1';
const PRESET_ENDPOINT = `${import.meta.env.BASE_URL}__texture/presets`;

const HALFTONE_DEFAULTS: TextureSettings = {
  textureType: 'halftone',
  enabled: true,
  animEnabled: false,
  animType: 'drift',
  speed: 3.6,
  directionDeg: 18,
  coherence: 1,
  spotCount: 18,
  spotSize: 43,
  spotBlur: 34,
  spotType: 'gaussian',
  spotScale: 1,
  spotOffsetX: 0,
  spotOffsetY: 0,
  spotMaskEnabled: false,
  spotMaskBrush: 'black',
  spotMaskBrushSize: 36,
  spotMaskBrushOpacity: 1,
  spotMaskFeather: 10,
  randomness: 0.17,
  dotEnabled: true,
  dotColor: '#000000',
  dotOpacity: 1,
  dotSpacing: 12,
  dotTileType: 'square',
  dotMinSize: 0.05,
  dotMaxSize: 1.75,
  dotYOffsetMap: 0,
  dotTurbulenceEnabled: false,
  dotTurbulenceStrength: 0,
  dotTurbulenceSmoothness: 72,
  dotTurbulenceSeed: 173,
  contrast: 0.56,
  threshold: 0.15,
  fadeEdgeTop: 0.32,
  fadeEdgeBottom: 0.32,
  fadeEdgeLeft: 0.32,
  fadeEdgeRight: 0.32,
  symbol: 'square',
  dotSymbolChars: '，。“”、丶一丨丿㇏㇀𠃍亅',
  seed: 1413,
  mouseInteractive: false,
  mouseInteractionRadius: 84,
  mouseInteractionInitialSpeed: 4,
  mouseInteractionFinalSpeed: 0,
  mouseInteractionDuration: 2,
  mouseInteractionArea: 0.5,
  mouseInteractionChars: '，。“”、丶一丨丿㇏㇀𠃍亅',
  activationEnabled: false,
  activationShowTexture: false,
  activationType: 'ripple',
  activationOffsetX: 0,
  activationOffsetY: 0,
  activationRadiusX: 601,
  activationRadiusY: 605,
  activationInitialSpeed: 4,
  activationFinalSpeed: 0,
  activationDuration: 3.4,
  activationRippleInterval: 1,
  activationRingWidth: 80,
  activationChars: '，。“”、丶一丨丿㇏㇀𠃍亅',
  gradientEnabled: false,
  gradientStops: [
    { position: 0, color: '#DEF1F8', opacity: 1 },
    { position: 1, color: '#DCE9F7', opacity: 1 },
  ],
  gradientAngle: 90,
  gradientFadeEdgeTop: 0,
  gradientFadeEdgeBottom: 0,
  gradientFadeEdgeLeft: 0,
  gradientFadeEdgeRight: 0,
  gradientAnimType: 'none',
  gradientFlowScaleX: 0.6,
  gradientFlowScaleY: 0.6,
  gradientFlowRotation: 0,
  gradientFlowWarp: 2.5,
  gradientFlowSoftness: 0.35,
  gradientFlowComplexity: 5,
  gradientAnimEnabled: false,
  gradientAnimSpeed: 1,
  gradientAnimIntensity: 0.3,
  gradientAnimDirection: 0,
};

const GRADIENT_DEFAULTS: TextureSettings = {
  ...HALFTONE_DEFAULTS,
  textureType: 'gradient',
  animEnabled: true,
  animType: 'vortex',
  speed: 2,
  spotCount: 7,
  spotSize: 100,
  spotBlur: 0,
  spotScale: 1,
  randomness: 0.36,
  dotColor: '#000000',
  dotOpacity: 1,
  dotSpacing: 11,
  dotMinSize: 0.28,
  dotMaxSize: 1.2,
  contrast: 1.08,
  threshold: 0.08,
  symbol: 'circle',
  dotSymbolChars: '01{}[]()<>/\\=+-*;:._#$&|!?',
  seed: 26,
  mouseInteractive: true,
  mouseInteractionRadius: 20,
  mouseInteractionChars: '01{}[]()<>/\\=+-*;:._#$&|!?',
  activationOffsetY: 0,
  activationRadiusX: 300,
  activationRadiusY: 300,
  activationDuration: 3,
  activationRingWidth: 80,
  activationChars: '01{}[]()<>/\\=+-*;:._#$&|!?',
  gradientEnabled: true,
  gradientStops: [
    { position: 0, color: '#7B2FF7', opacity: 1 },
    { position: 0.34, color: '#2B86FF', opacity: 1 },
    { position: 0.67, color: '#19D39A', opacity: 1 },
    { position: 1, color: '#4da3ff', opacity: 1 },
  ],
  gradientAnimType: 'flow',
  gradientFlowScaleX: 0.1,
  gradientFlowScaleY: 0.1,
  gradientFlowRotation: 0,
  gradientFlowWarp: 1,
  gradientFlowSoftness: 0.04,
  gradientFlowComplexity: 3,
  gradientAnimEnabled: false,
  gradientAnimSpeed: 0.1,
  gradientAnimIntensity: 0.5,
  gradientAnimDirection: 0,
};

export const TEXTURE_DEFAULTS: TextureSettings = HALFTONE_DEFAULTS;

export function getTextureDefaults(textureType: TextureType): TextureSettings {
  return textureType === 'gradient' ? GRADIENT_DEFAULTS : HALFTONE_DEFAULTS;
}

function clampSetting(value: unknown, min: number, max: number, fallback: number) {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}

function sanitizeColor(value: unknown, fallback = TEXTURE_DEFAULTS.dotColor) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function sanitizeCharacterSet(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const chars = Array.from(value).filter(char => !/\s/.test(char));
  return chars.length ? chars.join('').slice(0, 48) : fallback;
}

function sanitizeSmudgePoint(raw: unknown): SmudgeDistortionPoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const point = raw as Partial<SmudgeDistortionPoint>;
  return {
    x: clampSetting(point.x, 0, 1, 0),
    y: clampSetting(point.y, 0, 1, 0),
  };
}

export function sanitizeSmudgeDistortionFilter(raw: unknown): SmudgeDistortionFilter {
  const input = raw && typeof raw === 'object' ? raw as Partial<SmudgeDistortionFilter> : {};
  const strokes = Array.isArray(input.strokes)
    ? input.strokes.map(item => {
        if (!item || typeof item !== 'object') return null;
        const stroke = item as Partial<SmudgeDistortionStroke>;
        const points = Array.isArray(stroke.points)
          ? stroke.points.map(sanitizeSmudgePoint).filter((point): point is SmudgeDistortionPoint => point !== null).slice(0, 400)
          : [];
        if (points.length < 2) return null;
        return {
          points,
          brushSize: clampSetting(stroke.brushSize, 4, 400, 80),
          brushStrength: clampSetting(stroke.brushStrength, 0, 1, 0.45),
          brushFeather: clampSetting(stroke.brushFeather, 0, 400, 48),
        };
      }).filter((item): item is SmudgeDistortionStroke => item !== null).slice(-80)
    : [];

  return {
    type: 'smudgeDistortion',
    enabled: typeof input.enabled === 'boolean' ? input.enabled : true,
    strength: clampSetting(input.strength, 0, 1, 1),
    brushEnabled: typeof input.brushEnabled === 'boolean' ? input.brushEnabled : true,
    brushSize: clampSetting(input.brushSize, 4, 400, 80),
    brushStrength: clampSetting(input.brushStrength, 0, 1, 0.45),
    brushFeather: clampSetting(input.brushFeather, 0, 400, 48),
    strokes,
  };
}

export function sanitizeGradientStops(raw: unknown, fallback = TEXTURE_DEFAULTS.gradientStops): GradientColorStop[] {
  if (!Array.isArray(raw) || raw.length < 2) return fallback;
  const stops = raw.map((item: unknown) => {
    if (!item || typeof item !== 'object') return null;
    const stop = item as Partial<GradientColorStop>;
    return {
      position: clampSetting(stop.position, 0, 1, 0),
      color: sanitizeColor(stop.color, '#000000'),
      opacity: clampSetting(stop.opacity, 0, 1, 1),
    };
  }).filter((item): item is GradientColorStop => item !== null);
  if (stops.length < 2) return fallback;
  return stops.sort((a, b) => a.position - b.position).slice(0, 8);
}

export function sanitizeTextureSettings(raw: unknown): TextureSettings {
  const input = raw && typeof raw === 'object' ? raw as Partial<TextureSettings> : {};
  const textureType: TextureType = (['halftone', 'gradient'] as const).includes(input.textureType as TextureType)
    ? input.textureType as TextureType
    : input.gradientEnabled === true
      ? 'gradient'
      : TEXTURE_DEFAULTS.textureType;
  const defaults = getTextureDefaults(textureType);
  return {
    textureType,
    enabled: true,
    animEnabled: typeof input.animEnabled === 'boolean' ? input.animEnabled : defaults.animEnabled,
    animType: (['drift', 'breathe', 'vortex', 'wave', 'float'] as const).includes(input.animType as any) ? input.animType as TextureAnimType : defaults.animType,
    speed: clampSetting(input.speed, 1, 10, defaults.speed),
    directionDeg: clampSetting(input.directionDeg, 0, 360, defaults.directionDeg),
    coherence: clampSetting(input.coherence, 0, 2, defaults.coherence),
    spotCount: Math.round(clampSetting(input.spotCount, 1, 40, defaults.spotCount)),
    spotSize: clampSetting(input.spotSize, 8, 500, defaults.spotSize),
    spotBlur: clampSetting(input.spotBlur, 0, 200, defaults.spotBlur),
    spotType: (['gaussian', 'wave', 'cellular', 'ripple', 'streak'] as const).includes(input.spotType as any) ? input.spotType as TextureSpotType : defaults.spotType,
    spotScale: clampSetting(input.spotScale, 0.1, 10, defaults.spotScale),
    spotOffsetX: clampSetting(input.spotOffsetX, -400, 400, defaults.spotOffsetX),
    spotOffsetY: clampSetting(input.spotOffsetY, -400, 400, defaults.spotOffsetY),
    spotMaskEnabled: typeof input.spotMaskEnabled === 'boolean' ? input.spotMaskEnabled : defaults.spotMaskEnabled,
    spotMaskBrush: input.spotMaskBrush === 'white' ? 'white' : defaults.spotMaskBrush,
    spotMaskBrushSize: clampSetting(input.spotMaskBrushSize, 4, 200, defaults.spotMaskBrushSize),
    spotMaskBrushOpacity: clampSetting(input.spotMaskBrushOpacity, 0, 1, defaults.spotMaskBrushOpacity),
    spotMaskFeather: clampSetting(input.spotMaskFeather, 0, 100, defaults.spotMaskFeather),
    randomness: clampSetting(input.randomness, 0, 1, defaults.randomness),
    dotEnabled: typeof input.dotEnabled === 'boolean' ? input.dotEnabled : defaults.dotEnabled,
    dotColor: sanitizeColor(input.dotColor, defaults.dotColor),
    dotOpacity: clampSetting(input.dotOpacity, 0, 1, defaults.dotOpacity),
    dotSpacing: clampSetting(input.dotSpacing, 6, 36, defaults.dotSpacing),
    dotTileType: input.dotTileType === 'hexagon' ? 'hexagon' : defaults.dotTileType,
    dotMinSize: clampSetting(input.dotMinSize, 0.05, 2.5, defaults.dotMinSize),
    dotMaxSize: clampSetting(input.dotMaxSize, 0.4, 15, defaults.dotMaxSize),
    dotYOffsetMap: clampSetting(input.dotYOffsetMap, 0, 60, defaults.dotYOffsetMap),
    dotTurbulenceEnabled: typeof input.dotTurbulenceEnabled === 'boolean' ? input.dotTurbulenceEnabled : defaults.dotTurbulenceEnabled,
    dotTurbulenceStrength: clampSetting(input.dotTurbulenceStrength, 0, 80, defaults.dotTurbulenceStrength),
    dotTurbulenceSmoothness: clampSetting(input.dotTurbulenceSmoothness, 8, 480, defaults.dotTurbulenceSmoothness),
    dotTurbulenceSeed: Math.round(clampSetting(input.dotTurbulenceSeed, 1, 9999, defaults.dotTurbulenceSeed)),
    contrast: clampSetting(input.contrast, 0.2, 3, defaults.contrast),
    threshold: clampSetting(input.threshold, 0, 1, defaults.threshold),
    fadeEdgeTop: clampSetting((input as any).fadeEdgeTop ?? (input as any).fadeEdges, 0, 2, defaults.fadeEdgeTop),
    fadeEdgeBottom: clampSetting((input as any).fadeEdgeBottom ?? (input as any).fadeEdges, 0, 2, defaults.fadeEdgeBottom),
    fadeEdgeLeft: clampSetting((input as any).fadeEdgeLeft ?? (input as any).fadeEdges, 0, 2, defaults.fadeEdgeLeft),
    fadeEdgeRight: clampSetting((input as any).fadeEdgeRight ?? (input as any).fadeEdges, 0, 2, defaults.fadeEdgeRight),
    symbol: (['circle', 'square', 'diamond', 'plus', 'star', 'chars'] as const).includes(input.symbol as any) ? input.symbol as TextureSymbol : defaults.symbol,
    dotSymbolChars: sanitizeCharacterSet(input.dotSymbolChars, defaults.dotSymbolChars),
    seed: Math.round(clampSetting(input.seed, 1, 9999, defaults.seed)),
    mouseInteractive: typeof input.mouseInteractive === 'boolean' ? input.mouseInteractive : defaults.mouseInteractive,
    mouseInteractionRadius: clampSetting(input.mouseInteractionRadius, 10, 200, defaults.mouseInteractionRadius),
    mouseInteractionInitialSpeed: clampSetting(input.mouseInteractionInitialSpeed, 0, 24, defaults.mouseInteractionInitialSpeed),
    mouseInteractionFinalSpeed: clampSetting(input.mouseInteractionFinalSpeed, 0, 24, defaults.mouseInteractionFinalSpeed),
    mouseInteractionDuration: clampSetting(input.mouseInteractionDuration, 0.2, 6, defaults.mouseInteractionDuration),
    mouseInteractionArea: clampSetting(input.mouseInteractionArea, 0, 1, defaults.mouseInteractionArea),
    mouseInteractionChars: sanitizeCharacterSet(input.mouseInteractionChars, defaults.mouseInteractionChars),
    activationEnabled: typeof input.activationEnabled === 'boolean' ? input.activationEnabled : defaults.activationEnabled,
    activationShowTexture: typeof input.activationShowTexture === 'boolean' ? input.activationShowTexture : defaults.activationShowTexture,
    activationType: (['ripple', 'pulse', 'sweep'] as const).includes(input.activationType as any) ? input.activationType as TextureActivationType : defaults.activationType,
    activationOffsetX: clampSetting(input.activationOffsetX, -500, 500, defaults.activationOffsetX),
    activationOffsetY: clampSetting(input.activationOffsetY, -500, 500, defaults.activationOffsetY),
    activationRadiusX: clampSetting(input.activationRadiusX ?? (input as any).activationRadius, 50, 800, defaults.activationRadiusX),
    activationRadiusY: clampSetting(input.activationRadiusY ?? (input as any).activationRadius, 50, 800, defaults.activationRadiusY),
    activationInitialSpeed: clampSetting(input.activationInitialSpeed, 0, 24, defaults.activationInitialSpeed),
    activationFinalSpeed: clampSetting(input.activationFinalSpeed, 0, 24, defaults.activationFinalSpeed),
    activationDuration: clampSetting(input.activationDuration, 0.5, 10, defaults.activationDuration),
    activationRippleInterval: clampSetting(input.activationRippleInterval, 0.1, 4, defaults.activationRippleInterval),
    activationRingWidth: clampSetting(input.activationRingWidth, 10, 300, defaults.activationRingWidth),
    activationChars: sanitizeCharacterSet(input.activationChars, defaults.activationChars),
    gradientEnabled: textureType === 'gradient',
    gradientStops: sanitizeGradientStops(input.gradientStops, defaults.gradientStops),
    gradientAngle: clampSetting(input.gradientAngle, 0, 360, defaults.gradientAngle),
    gradientFadeEdgeTop: clampSetting(input.gradientFadeEdgeTop, 0, 2, defaults.gradientFadeEdgeTop),
    gradientFadeEdgeBottom: clampSetting(input.gradientFadeEdgeBottom, 0, 2, defaults.gradientFadeEdgeBottom),
    gradientFadeEdgeLeft: clampSetting(input.gradientFadeEdgeLeft, 0, 2, defaults.gradientFadeEdgeLeft),
    gradientFadeEdgeRight: clampSetting(input.gradientFadeEdgeRight, 0, 2, defaults.gradientFadeEdgeRight),
    gradientAnimType: input.gradientAnimType === 'flow' ? 'flow' : defaults.gradientAnimType,
    gradientFlowScaleX: clampSetting(input.gradientFlowScaleX ?? (input as any).gradientFlowScale, 0.01, 1, defaults.gradientFlowScaleX),
    gradientFlowScaleY: clampSetting(input.gradientFlowScaleY ?? (input as any).gradientFlowScale, 0.01, 1, defaults.gradientFlowScaleY),
    gradientFlowRotation: clampSetting(input.gradientFlowRotation, 0, 360, defaults.gradientFlowRotation),
    gradientFlowWarp: clampSetting(input.gradientFlowWarp, 0, 6, defaults.gradientFlowWarp),
    gradientFlowSoftness: clampSetting(input.gradientFlowSoftness, 0, 1, defaults.gradientFlowSoftness),
    gradientFlowComplexity: Math.round(clampSetting(input.gradientFlowComplexity, 1, 6, defaults.gradientFlowComplexity)),
    gradientAnimEnabled: typeof input.gradientAnimEnabled === 'boolean' ? input.gradientAnimEnabled : defaults.gradientAnimEnabled,
    gradientAnimSpeed: clampSetting(input.gradientAnimSpeed, 0.01, 1, defaults.gradientAnimSpeed),
    gradientAnimIntensity: clampSetting(input.gradientAnimIntensity, 0, 1, defaults.gradientAnimIntensity),
    gradientAnimDirection: clampSetting(input.gradientAnimDirection, 0, 360, defaults.gradientAnimDirection),
  };
}

export function sanitizePresetLayerState(raw: unknown): TexturePresetLayerState {
  if (raw && typeof raw === 'object' && Array.isArray((raw as Partial<TexturePresetLayerState>).layers)) {
    const input = raw as Partial<TexturePresetLayerState>;
    const layers = (input.layers ?? [])
      .map((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const layer = item as Partial<TexturePresetLayer> & { settings?: unknown; blendMode?: unknown; filter?: unknown; kind?: unknown };
        const id = typeof layer.id === 'string' && layer.id.trim() ? layer.id.trim() : `layer-${index + 1}`;
        const name = typeof layer.name === 'string' && layer.name.trim() ? layer.name.trim() : `图层${index + 1}`;
        if (layer.kind === 'filter') {
          return {
            id,
            kind: 'filter',
            name,
            filter: sanitizeSmudgeDistortionFilter(layer.filter),
          };
        }
        return {
          id,
          kind: 'texture',
          name,
          settings: sanitizeTextureSettings(layer.settings),
          blendMode: typeof layer.blendMode === 'string' && layer.blendMode.trim() ? layer.blendMode.trim() : 'normal',
        };
      })
      .filter((item): item is TexturePresetLayer => item !== null);
    if (layers.length > 0) {
      const selectedLayerId = typeof input.selectedLayerId === 'string' && layers.some(layer => layer.id === input.selectedLayerId)
        ? input.selectedLayerId
        : layers[0].id;
      return { layers, selectedLayerId };
    }
  }

  const settings = sanitizeTextureSettings(raw);
  const layer: TexturePresetLayer = {
    id: 'layer-1',
    kind: 'texture',
    name: '图层1',
    settings,
    blendMode: 'normal',
  };
  return { layers: [layer], selectedLayerId: layer.id };
}

export function sanitizePresetFile(raw: unknown): TexturePresetFile {
  if (!raw || typeof raw !== 'object') return { selectedId: null, presets: [] };
  const input = raw as Partial<TexturePresetFile>;
  const presets = Array.isArray(input.presets)
    ? input.presets.map(item => {
        if (!item || typeof item !== 'object') return null;
        const preset = item as Partial<TexturePreset>;
        if (typeof preset.id !== 'string' || !preset.id.trim()) return null;
        const now = new Date().toISOString();
        const layerState = sanitizePresetLayerState(preset.layerState ?? preset.settings);
        const selectedLayer = layerState.layers.find(layer => layer.id === layerState.selectedLayerId && layer.kind === 'texture') as TexturePresetTextureLayer | undefined;
        const firstTextureLayer = layerState.layers.find((layer): layer is TexturePresetTextureLayer => layer.kind === 'texture');
        return {
          id: preset.id.trim(),
          name: typeof preset.name === 'string' && preset.name.trim() ? preset.name.trim() : '未命名纹理预设',
          settings: (selectedLayer ?? firstTextureLayer)?.settings ?? sanitizeTextureSettings(preset.settings),
          layerState,
          createdAt: typeof preset.createdAt === 'string' ? preset.createdAt : now,
          updatedAt: typeof preset.updatedAt === 'string' ? preset.updatedAt : now,
        };
      }).filter((item): item is TexturePreset => item !== null)
    : [];
  const selectedId = typeof input.selectedId === 'string' && presets.some(preset => preset.id === input.selectedId)
    ? input.selectedId
    : null;
  return { selectedId, presets };
}

function withBundledPresetFallback(file: TexturePresetFile): TexturePresetFile {
  if (file.presets.length > 0) return file;
  return sanitizePresetFile(bundledPresetFile);
}

function readPresetStorage(): TexturePresetFile {
  const bundled = sanitizePresetFile(bundledPresetFile);
  if (typeof window === 'undefined') return bundled;
  try {
    const raw = window.localStorage.getItem(PRESET_STORAGE_KEY);
    if (!raw) return bundled;
    return withBundledPresetFallback(sanitizePresetFile(JSON.parse(raw)));
  } catch {
    return bundled;
  }
}

function writePresetStorage(file: TexturePresetFile): TexturePresetFile {
  const clean = sanitizePresetFile(file);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(clean));
  }
  return clean;
}

export async function readPresetFile(): Promise<TexturePresetFile> {
  try {
    const res = await fetch(PRESET_ENDPOINT, { cache: 'no-store' });
    if (!res.ok) throw new Error(await res.text());
    const file = withBundledPresetFallback(sanitizePresetFile(await res.json().catch(() => ({}))));
    return writePresetStorage(file);
  } catch {
    return readPresetStorage();
  }
}

export async function writePresetFile(file: TexturePresetFile): Promise<TexturePresetFile> {
  const clean = sanitizePresetFile(file);
  try {
    const res = await fetch(PRESET_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clean),
    });
    if (!res.ok) throw new Error(await res.text());
    const saved = sanitizePresetFile(await res.json().catch(() => clean));
    return writePresetStorage(saved);
  } catch {
    return writePresetStorage(clean);
  }
}
