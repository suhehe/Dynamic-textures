import bundledPresetFile from '../data/texture-presets.json';

export type TextureSymbol = 'circle' | 'square' | 'diamond' | 'plus' | 'star' | 'chars';
export type TextureSpotType = 'gaussian' | 'wave' | 'cellular' | 'ripple' | 'streak';
export type TextureAnimType = 'drift' | 'breathe' | 'vortex' | 'wave' | 'float';
export type TextureActivationType = 'ripple' | 'pulse' | 'sweep';
export const GRADIENT_ANIM_TYPE_VALUES = ['none', 'flow', 'turbulence', 'curl', 'wave', 'polarWave', 'voronoi', 'metaballs', 'liquidSDF', 'vortex'] as const;
export type TextureGradientAnimType = typeof GRADIENT_ANIM_TYPE_VALUES[number];
export type TextureGradientAlgorithm = Exclude<TextureGradientAnimType, 'none'>;
export type DynamicImageFitType = 'cover' | 'contain';
export const DYNAMIC_IMAGE_ALGORITHM_VALUES = ['flowDistort', 'ripple', 'chromaticAberration', 'pixelate'] as const;
export type TextureDynamicImageAlgorithm = typeof DYNAMIC_IMAGE_ALGORITHM_VALUES[number];
export type TextureDynamicImageDeformationAlgorithm = typeof DYNAMIC_IMAGE_DEFORMATION_ALGORITHMS[number];
export type TextureTileType = 'square' | 'hexagon';
export type TextureMaskBrush = 'black' | 'white';
export type TextureType = 'halftone' | 'gradient' | 'dynamicImage';
export type TransformParamKey = 'scale' | 'aspectRatio' | 'offsetX' | 'offsetY';

export interface TransformParams {
  scale: number;
  aspectRatio: number;
  offsetX: number;
  offsetY: number;
}

export interface TransformParamDef {
  key: TransformParamKey;
  label: string;
  min: number;
  max: number;
  step: number;
  digits?: number;
  suffix?: string;
}

export interface TransformParamBounds {
  scaleMin: number;
  scaleMax: number;
  aspectRatioMin: number;
  aspectRatioMax: number;
}

export const TRANSFORM_PARAMS_DEFAULTS: TransformParams = {
  scale: 1,
  aspectRatio: 1,
  offsetX: 0,
  offsetY: 0,
};

export const TRANSFORM_PARAM_BOUNDS_DEFAULT: TransformParamBounds = {
  scaleMin: 1,
  scaleMax: 10,
  aspectRatioMin: 0.1,
  aspectRatioMax: 10,
};

export const GRADIENT_ALGO_TRANSFORM_PARAM_BOUNDS: TransformParamBounds = {
  scaleMin: 0.01,
  scaleMax: 1,
  aspectRatioMin: 0.1,
  aspectRatioMax: 10,
};

export const TRANSFORM_PARAM_DEFS: TransformParamDef[] = [
  { key: 'scale', label: '缩放', min: 1, max: 10, step: 0.01, digits: 2 },
  { key: 'aspectRatio', label: 'XY比例', min: 0.1, max: 10, step: 0.01, digits: 2 },
  { key: 'offsetX', label: 'X轴偏移', min: -1, max: 1, step: 1, digits: 0, suffix: ' px' },
  { key: 'offsetY', label: 'Y轴偏移', min: -1, max: 1, step: 1, digits: 0, suffix: ' px' },
];

export const GRADIENT_ALGO_TRANSFORM_PARAM_DEFS: TransformParamDef[] = [
  { key: 'scale', label: '缩放', min: 0.01, max: 1, step: 0.01, digits: 2 },
  { key: 'aspectRatio', label: 'XY比例', min: 0.1, max: 10, step: 0.01, digits: 2 },
  { key: 'offsetX', label: 'X轴偏移', min: -1, max: 1, step: 1, digits: 0, suffix: ' px' },
  { key: 'offsetY', label: 'Y轴偏移', min: -1, max: 1, step: 1, digits: 0, suffix: ' px' },
];

export const DYNAMIC_IMAGE_DEFORMATION_ALGORITHMS = ['flowDistort', 'ripple'] as const;

export interface GradientColorStop {
  position: number;
  color: string;
  opacity: number;
}

export interface TextureSettings {
  textureType: TextureType;
  enabled: boolean;
  transform: TransformParams;
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
  gradientFlowRotation: number;
  gradientFlowWarp: number;
  gradientFlowSoftness: number;
  gradientFlowComplexity: number;
  gradientFlowParamA: number;
  gradientFlowParamB: number;
  gradientAnimEnabled: boolean;
  gradientAnimSpeed: number;
  gradientAnimIntensity: number;
  gradientAnimDirection: number;
  dynamicImageFit: DynamicImageFitType;
  dynamicImageAssetId: string;
  dynamicImageAssetName: string;
  dynamicImageAssetWidth: number;
  dynamicImageAssetHeight: number;
  dynamicImageAlgorithm: TextureDynamicImageAlgorithm;
  dynamicImageScale: number;
  dynamicImageAspectRatio: number;
  dynamicImageOffsetX: number;
  dynamicImageOffsetY: number;
  dynamicImageSpeed: number;
  dynamicImageStrength: number;
  dynamicImageParamA: number;
  dynamicImageParamB: number;
  dynamicImageOpacity: number;
}

export type GradientParamKey = Extract<keyof TextureSettings,
  'gradientAnimSpeed' | 'gradientFlowRotation' |
  'gradientFlowWarp' | 'gradientFlowSoftness' | 'gradientFlowComplexity' |
  'gradientFlowParamA' | 'gradientFlowParamB'
>;

export interface GradientAlgoParam {
  key: GradientParamKey;
  label: string;
  min: number;
  max: number;
  step: number;
  digits?: number;
  suffix?: string;
}

export interface GradientAlgoDef {
  id: TextureGradientAlgorithm;
  label: string;
  params: GradientAlgoParam[];
  defaults: Partial<TextureSettings>;
}

export type DynamicImageParamKey = Extract<keyof TextureSettings,
  'dynamicImageSpeed' | 'dynamicImageStrength' | 'dynamicImageParamA' | 'dynamicImageParamB' | 'dynamicImageOpacity'
>;

export interface DynamicImageAlgoParam {
  key: DynamicImageParamKey;
  label: string;
  min: number;
  max: number;
  step: number;
  digits?: number;
  suffix?: string;
}

export interface DynamicImageAlgoDef {
  id: TextureDynamicImageAlgorithm;
  label: string;
  params: DynamicImageAlgoParam[];
  defaults: Partial<TextureSettings>;
}

const BASE_FLOW_PARAMS: GradientAlgoParam[] = [
  { key: 'gradientAnimSpeed', label: '流动速度', min: 0.01, max: 1, step: 0.01, digits: 2 },
  { key: 'gradientFlowRotation', label: '旋转纹理', min: 0, max: 360, step: 1, digits: 0, suffix: '°' },
];

function buildGradientAlgoTransform(scale: number, aspectRatio = 1): TransformParams {
  return {
    scale,
    aspectRatio,
    offsetX: 0,
    offsetY: 0,
  };
}

const DETAIL_PARAMS: GradientAlgoParam[] = [
  { key: 'gradientFlowComplexity', label: '复杂度', min: 1, max: 6, step: 1, digits: 0 },
  { key: 'gradientFlowWarp', label: '扭曲强度', min: 0, max: 6, step: 0.1, digits: 1 },
  { key: 'gradientFlowSoftness', label: '柔和度', min: 0, max: 1, step: 0.01, digits: 2 },
];

export const GRADIENT_ALGORITHM_GROUPS: Array<{ group: string; items: GradientAlgoDef[] }> = [
  {
    group: '噪声流动',
    items: [
      {
        id: 'flow',
        label: 'FBM 域扭曲噪声',
        defaults: {
          transform: buildGradientAlgoTransform(0.25, 1),
          gradientAnimSpeed: 0.1,
          gradientFlowRotation: 0,
          gradientFlowComplexity: 2,
          gradientFlowWarp: 1,
          gradientFlowSoftness: 0.16,
          gradientFlowParamA: 0.55,
          gradientFlowParamB: 0.5,
        },
        params: BASE_FLOW_PARAMS.concat(DETAIL_PARAMS),
      },
      {
        id: 'turbulence',
        label: '湍流 / 脊状噪声',
        defaults: {
          transform: buildGradientAlgoTransform(0.18, 1),
          gradientAnimSpeed: 0.16,
          gradientFlowRotation: 18,
          gradientFlowComplexity: 5,
          gradientFlowWarp: 2.4,
          gradientFlowSoftness: 0.18,
          gradientFlowParamA: 0.62,
          gradientFlowParamB: 0.34,
        },
        params: BASE_FLOW_PARAMS.concat([
          { key: 'gradientFlowComplexity', label: '噪声层数', min: 1, max: 6, step: 1, digits: 0 },
          { key: 'gradientFlowWarp', label: '湍流强度', min: 0, max: 6, step: 0.1, digits: 1 },
          { key: 'gradientFlowParamA', label: '脊线锐度', min: 0, max: 1, step: 0.01, digits: 2 },
          { key: 'gradientFlowSoftness', label: '柔和度', min: 0, max: 1, step: 0.01, digits: 2 },
        ]),
      },
      {
        id: 'curl',
        label: '旋度噪声流场',
        defaults: {
          transform: buildGradientAlgoTransform(0.11, 1),
          gradientAnimSpeed: 0.2,
          gradientFlowRotation: 0,
          gradientFlowComplexity: 6,
          gradientFlowWarp: 1,
          gradientFlowSoftness: 0.26,
          gradientFlowParamA: 0.81,
          gradientFlowParamB: 0.6,
        },
        params: BASE_FLOW_PARAMS.concat([
          { key: 'gradientFlowComplexity', label: '流场层数', min: 1, max: 6, step: 1, digits: 0 },
          { key: 'gradientFlowWarp', label: '平流强度', min: 0, max: 6, step: 0.1, digits: 1 },
          { key: 'gradientFlowParamA', label: '旋度半径', min: 0.05, max: 1, step: 0.01, digits: 2 },
          { key: 'gradientFlowSoftness', label: '柔和度', min: 0, max: 1, step: 0.01, digits: 2 },
        ]),
      },
    ],
  },
  {
    group: '融球色块',
    items: [
      {
        id: 'liquidSDF',
        label: '扩散液（程序性 SDF）',
        defaults: {
          transform: buildGradientAlgoTransform(0.4, 1),
          gradientAnimSpeed: 0.2,
          gradientFlowRotation: 0,
          gradientFlowComplexity: 4,
          gradientFlowWarp: 2.4,
          gradientFlowSoftness: 0,
          gradientFlowParamA: 3,
          gradientFlowParamB: 0.75,
        },
        params: [
          { key: 'gradientAnimSpeed', label: '流动速度', min: 0.01, max: 1, step: 0.01, digits: 2 },
          { key: 'gradientFlowWarp', label: '液化扭曲', min: 0, max: 6, step: 0.1, digits: 1 },
          { key: 'gradientFlowParamB', label: '扩散锐度', min: 0, max: 1, step: 0.01, digits: 2 },
        ],
      },
      {
        id: 'metaballs',
        label: 'Metaballs 变形球',
        defaults: {
          transform: buildGradientAlgoTransform(0.44, 1),
          gradientAnimSpeed: 1,
          gradientFlowRotation: 0,
          gradientFlowComplexity: 6,
          gradientFlowWarp: 0.8,
          gradientFlowSoftness: 0.51,
          gradientFlowParamA: 10,
          gradientFlowParamB: 0.27,
        },
        params: BASE_FLOW_PARAMS.concat([
          { key: 'gradientFlowParamA', label: '球体数量', min: 2, max: 10, step: 1, digits: 0 },
          { key: 'gradientFlowParamB', label: '球体半径', min: 0.08, max: 0.8, step: 0.01, digits: 2 },
          { key: 'gradientFlowWarp', label: '融合强度', min: 0, max: 6, step: 0.1, digits: 1 },
          { key: 'gradientFlowSoftness', label: '边缘柔和度', min: 0, max: 1, step: 0.01, digits: 2 },
        ]),
      },
    ],
  },
  {
    group: '波形干涉',
    items: [
      {
        id: 'wave',
        label: '波叠加干涉',
        defaults: {
          transform: buildGradientAlgoTransform(1, 2.5),
          gradientAnimSpeed: 0.9,
          gradientFlowRotation: 12,
          gradientFlowComplexity: 5,
          gradientFlowWarp: 2,
          gradientFlowSoftness: 0.8,
          gradientFlowParamA: 5,
          gradientFlowParamB: 0.3,
        },
        params: BASE_FLOW_PARAMS.concat([
          { key: 'gradientFlowParamA', label: '波组数量', min: 2, max: 8, step: 1, digits: 0 },
          { key: 'gradientFlowWarp', label: '干涉强度', min: 0, max: 6, step: 0.1, digits: 1 },
          { key: 'gradientFlowParamB', label: '相位错位', min: 0, max: 1, step: 0.01, digits: 2 },
          { key: 'gradientFlowSoftness', label: '柔和度', min: 0, max: 1, step: 0.01, digits: 2 },
        ]),
      },
      {
        id: 'polarWave',
        label: '极坐标波',
        defaults: {
          transform: buildGradientAlgoTransform(0.32, 1),
          gradientAnimSpeed: 0.5,
          gradientFlowRotation: 0,
          gradientFlowComplexity: 6,
          gradientFlowWarp: 4,
          gradientFlowSoftness: 0.78,
          gradientFlowParamA: 6,
          gradientFlowParamB: 0.6,
        },
        params: BASE_FLOW_PARAMS.concat([
          { key: 'gradientFlowParamA', label: '环波密度', min: 2, max: 16, step: 1, digits: 0 },
          { key: 'gradientFlowWarp', label: '极坐标扭曲', min: 0, max: 6, step: 0.1, digits: 1 },
          { key: 'gradientFlowParamB', label: '螺旋强度', min: 0, max: 1, step: 0.01, digits: 2 },
          { key: 'gradientFlowSoftness', label: '柔和度', min: 0, max: 1, step: 0.01, digits: 2 },
        ]),
      },
    ],
  },
  {
    group: '分区细胞',
    items: [
      {
        id: 'voronoi',
        label: 'Voronoi 细胞柔焦',
        defaults: {
          transform: buildGradientAlgoTransform(0.28, 1),
          gradientAnimSpeed: 0.12,
          gradientFlowRotation: 0,
          gradientFlowComplexity: 6,
          gradientFlowWarp: 5.2,
          gradientFlowSoftness: 0.67,
          gradientFlowParamA: 6,
          gradientFlowParamB: 0.56,
        },
        params: BASE_FLOW_PARAMS.concat([
          { key: 'gradientFlowParamA', label: '细胞密度', min: 2, max: 12, step: 1, digits: 0 },
          { key: 'gradientFlowWarp', label: '扰动强度', min: 0, max: 6, step: 0.1, digits: 1 },
          { key: 'gradientFlowParamB', label: '边缘柔焦', min: 0, max: 1, step: 0.01, digits: 2 },
          { key: 'gradientFlowSoftness', label: '色彩柔和度', min: 0, max: 1, step: 0.01, digits: 2 },
        ]),
      },
    ],
  },
  {
    group: '涡旋',
    items: [
      {
        id: 'vortex',
        label: '螺旋 / 涡旋场',
        defaults: {
          transform: buildGradientAlgoTransform(0.48, 1),
          gradientAnimSpeed: 0.76,
          gradientFlowRotation: 0,
          gradientFlowComplexity: 5,
          gradientFlowWarp: 3.2,
          gradientFlowSoftness: 0.2,
          gradientFlowParamA: 0.52,
          gradientFlowParamB: 0.56,
        },
        params: BASE_FLOW_PARAMS.concat([
          { key: 'gradientFlowWarp', label: '涡旋强度', min: 0, max: 6, step: 0.1, digits: 1 },
          { key: 'gradientFlowParamA', label: '中心吸引', min: 0, max: 1, step: 0.01, digits: 2 },
          { key: 'gradientFlowParamB', label: '径向波纹', min: 0, max: 1, step: 0.01, digits: 2 },
          { key: 'gradientFlowSoftness', label: '柔和度', min: 0, max: 1, step: 0.01, digits: 2 },
        ]),
      },
    ],
  },
];

export const GRADIENT_ALGORITHM_DEFS = GRADIENT_ALGORITHM_GROUPS.flatMap(group => group.items);
export const DEFAULT_GRADIENT_ALGORITHM: TextureGradientAlgorithm = 'flow';

export function getGradientAlgorithmDef(type: TextureGradientAnimType): GradientAlgoDef {
  return GRADIENT_ALGORITHM_DEFS.find(item => item.id === type) ?? GRADIENT_ALGORITHM_DEFS[0];
}

export function isGradientAlgorithm(type: TextureGradientAnimType): type is TextureGradientAlgorithm {
  return type !== 'none' && GRADIENT_ALGORITHM_DEFS.some(item => item.id === type);
}

const DYNAMIC_IMAGE_BASE_PARAMS: DynamicImageAlgoParam[] = [
  { key: 'dynamicImageSpeed', label: '动画速度', min: 0.01, max: 3, step: 0.01, digits: 2 },
  { key: 'dynamicImageStrength', label: '效果强度', min: 0, max: 1, step: 0.01, digits: 2 },
  { key: 'dynamicImageOpacity', label: '图层透明度', min: 0, max: 1, step: 0.01, digits: 2 },
];

export const DYNAMIC_IMAGE_ALGORITHM_GROUPS: Array<{ group: string; items: DynamicImageAlgoDef[] }> = [
  {
    group: '形变',
    items: [
      {
        id: 'flowDistort',
        label: '流体扭曲',
        defaults: {
          dynamicImageSpeed: 0.8,
          dynamicImageStrength: 0.44,
          dynamicImageParamA: 0.5,
          dynamicImageParamB: 0.35,
          dynamicImageOpacity: 1,
        },
        params: DYNAMIC_IMAGE_BASE_PARAMS.concat([
          { key: 'dynamicImageParamA', label: '纹理尺度', min: 0.05, max: 2, step: 0.01, digits: 2 },
          { key: 'dynamicImageParamB', label: '扭曲频率', min: 0.05, max: 2.5, step: 0.01, digits: 2 },
        ]),
      },
      {
        id: 'ripple',
        label: '波纹',
        defaults: {
          dynamicImageSpeed: 0.66,
          dynamicImageStrength: 0.7,
          dynamicImageParamA: 1.6,
          dynamicImageParamB: 0.7,
          dynamicImageOpacity: 1,
        },
        params: DYNAMIC_IMAGE_BASE_PARAMS.concat([
          { key: 'dynamicImageParamA', label: '波纹密度', min: 0.1, max: 2.5, step: 0.01, digits: 2 },
          { key: 'dynamicImageParamB', label: '扩散范围', min: 0.05, max: 1, step: 0.01, digits: 2 },
        ]),
      },
    ],
  },
  {
    group: '风格化',
    items: [
      {
        id: 'chromaticAberration',
        label: '色差故障',
        defaults: {
          dynamicImageSpeed: 1.15,
          dynamicImageStrength: 0.5,
          dynamicImageParamA: 0.42,
          dynamicImageParamB: 0.1,
          dynamicImageOpacity: 1,
        },
        params: DYNAMIC_IMAGE_BASE_PARAMS.concat([
          { key: 'dynamicImageParamA', label: '通道偏移', min: 0.05, max: 1, step: 0.01, digits: 2 },
          { key: 'dynamicImageParamB', label: '噪声抖动', min: 0, max: 1, step: 0.01, digits: 2 },
        ]),
      },
      {
        id: 'pixelate',
        label: '像素化',
        defaults: {
          dynamicImageSpeed: 0.36,
          dynamicImageStrength: 0.6,
          dynamicImageParamA: 24,
          dynamicImageParamB: 0.58,
          dynamicImageOpacity: 1,
        },
        params: DYNAMIC_IMAGE_BASE_PARAMS.concat([
          { key: 'dynamicImageParamA', label: '像素尺寸', min: 4, max: 96, step: 1, digits: 0, suffix: ' px' },
          { key: 'dynamicImageParamB', label: '边缘锐化', min: 0, max: 1, step: 0.01, digits: 2 },
        ]),
      },
    ],
  },
];

export const DYNAMIC_IMAGE_ALGORITHM_DEFS = DYNAMIC_IMAGE_ALGORITHM_GROUPS.flatMap(group => group.items);
export const DEFAULT_DYNAMIC_IMAGE_ALGORITHM: TextureDynamicImageAlgorithm = 'flowDistort';

export function isDynamicImageDeformationAlgorithm(value: TextureDynamicImageAlgorithm) {
  return DYNAMIC_IMAGE_DEFORMATION_ALGORITHMS.includes(value as TextureDynamicImageDeformationAlgorithm);
}

export function getDynamicImageAlgorithmDef(id: TextureDynamicImageAlgorithm): DynamicImageAlgoDef {
  return DYNAMIC_IMAGE_ALGORITHM_DEFS.find(item => item.id === id) ?? DYNAMIC_IMAGE_ALGORITHM_DEFS[0];
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

export interface SmudgeDistortionEffect {
  type: 'smudgeDistortion';
  enabled: boolean;
  transform: TransformParams;
  strength: number;
  precision: number;
  brushEnabled: boolean;
  brushSize: number;
  brushStrength: number;
  brushFeather: number;
  strokes: SmudgeDistortionStroke[];
}

export interface PaintMaskStroke {
  points: SmudgeDistortionPoint[];
  brush: TextureMaskBrush;
  brushSize: number;
  brushOpacity: number;
  brushFeather: number;
}

export interface PaintMaskEffect {
  type: 'paintMask';
  enabled: boolean;
  brushEnabled: boolean;
  brush: TextureMaskBrush;
  brushSize: number;
  brushOpacity: number;
  brushFeather: number;
  strokes: PaintMaskStroke[];
}

export type PixelGrainBlendMode = 'overlay' | 'softLight' | 'screen' | 'multiply';

export interface PixelGrainEffect {
  type: 'pixelGrain';
  enabled: boolean;
  amount: number;
  blendMode: PixelGrainBlendMode;
  seed: number;
}

export interface DynamicImageEffect {
  type: 'dynamicImageEffect';
  enabled: boolean;
  transform: TransformParams;
  algorithm: TextureDynamicImageAlgorithm;
  speed: number;
  strength: number;
  paramA: number;
  paramB: number;
  opacity: number;
}

export type OutlinesInputMode = 'luma' | 'inverseLuma' | 'alpha';
export const OUTLINES_MAX_STOPS = 8;
export const OUTLINES_DEFAULT_LINE_GRADIENT: GradientColorStop[] = [
  { position: 0, color: '#ffffff', opacity: 1 },
  { position: 1, color: '#ffffff', opacity: 1 },
];

export interface OutlinesEffect {
  type: 'outlines';
  enabled: boolean;
  inputMode: OutlinesInputMode;
  threshold: number;
  count: number;
  fieldScale: number;
  lineGradientStops: GradientColorStop[];
  thickness: number;
  spacing: number;
  softness: number;
  offset: number;
  phase: number;
  smoothing: number;
  gaussianSamples: number;
  animationEnabled: boolean;
  speed: number;
}

export type TextureEffect = SmudgeDistortionEffect | PaintMaskEffect | PixelGrainEffect | DynamicImageEffect | OutlinesEffect;

export interface TexturePresetTextureLayer {
  id: string;
  kind: 'texture';
  name: string;
  visible: boolean;
  settings: TextureSettings;
  blendMode: string;
}

export interface TexturePresetEffectLayer {
  id: string;
  kind: 'effect';
  name: string;
  visible: boolean;
  effect: TextureEffect;
}

export type TexturePresetLayer = TexturePresetTextureLayer | TexturePresetEffectLayer;

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
  transform: TRANSFORM_PARAMS_DEFAULTS,
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
  gradientFlowRotation: 0,
  gradientFlowWarp: 2.5,
  gradientFlowSoftness: 0.35,
  gradientFlowComplexity: 5,
  gradientFlowParamA: 0.55,
  gradientFlowParamB: 0.5,
  gradientAnimEnabled: false,
  gradientAnimSpeed: 1,
  gradientAnimIntensity: 0.3,
  gradientAnimDirection: 0,
  dynamicImageFit: 'cover',
  dynamicImageAssetId: '',
  dynamicImageAssetName: '',
  dynamicImageAssetWidth: 0,
  dynamicImageAssetHeight: 0,
  dynamicImageAlgorithm: 'flowDistort',
  dynamicImageScale: 1,
  dynamicImageAspectRatio: 1,
  dynamicImageOffsetX: 0,
  dynamicImageOffsetY: 0,
  dynamicImageSpeed: 0.8,
  dynamicImageStrength: 0.44,
  dynamicImageParamA: 0.5,
  dynamicImageParamB: 0.35,
  dynamicImageOpacity: 1,
};

const GRADIENT_DEFAULTS: TextureSettings = {
  ...HALFTONE_DEFAULTS,
  textureType: 'gradient',
  transform: buildGradientAlgoTransform(0.25, 1),
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
  gradientFlowRotation: 0,
  gradientFlowWarp: 1,
  gradientFlowSoftness: 0.16,
  gradientFlowComplexity: 2,
  gradientFlowParamA: 0.55,
  gradientFlowParamB: 0.5,
  gradientAnimEnabled: false,
  gradientAnimSpeed: 0.1,
  gradientAnimIntensity: 0.5,
  gradientAnimDirection: 0,
  dynamicImageFit: 'cover',
  dynamicImageAssetId: '',
  dynamicImageAssetName: '',
  dynamicImageAssetWidth: 0,
  dynamicImageAssetHeight: 0,
  dynamicImageAlgorithm: 'flowDistort',
  dynamicImageScale: 1,
  dynamicImageAspectRatio: 1,
  dynamicImageOffsetX: 0,
  dynamicImageOffsetY: 0,
  dynamicImageSpeed: 0.8,
  dynamicImageStrength: 0.44,
  dynamicImageParamA: 0.5,
  dynamicImageParamB: 0.35,
  dynamicImageOpacity: 1,
};

const DYNAMIC_IMAGE_DEFAULTS: TextureSettings = {
  ...HALFTONE_DEFAULTS,
  textureType: 'dynamicImage',
  animEnabled: true,
  gradientEnabled: false,
  dynamicImageFit: 'cover',
  dynamicImageAssetId: '',
  dynamicImageAssetName: '',
  dynamicImageAssetWidth: 0,
  dynamicImageAssetHeight: 0,
  dynamicImageAlgorithm: 'flowDistort',
  dynamicImageScale: 1,
  dynamicImageAspectRatio: 1,
  dynamicImageOffsetX: 0,
  dynamicImageOffsetY: 0,
  dynamicImageSpeed: 0.8,
  dynamicImageStrength: 0.44,
  dynamicImageParamA: 0.5,
  dynamicImageParamB: 0.35,
  dynamicImageOpacity: 1,
};

export const TEXTURE_DEFAULTS: TextureSettings = HALFTONE_DEFAULTS;

export function getTextureDefaults(textureType: TextureType): TextureSettings {
  if (textureType === 'gradient') return GRADIENT_DEFAULTS;
  if (textureType === 'dynamicImage') return DYNAMIC_IMAGE_DEFAULTS;
  return HALFTONE_DEFAULTS;
}

function clampSetting(value: unknown, min: number, max: number, fallback: number) {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}

export function sanitizeTransformParams(
  raw: unknown,
  fallback: TransformParams = TRANSFORM_PARAMS_DEFAULTS,
  bounds: TransformParamBounds = TRANSFORM_PARAM_BOUNDS_DEFAULT,
): TransformParams {
  const input = raw && typeof raw === 'object' ? raw as Partial<TransformParams> : {};
  return {
    scale: clampSetting(input.scale, bounds.scaleMin, bounds.scaleMax, fallback.scale),
    aspectRatio: clampSetting(input.aspectRatio, bounds.aspectRatioMin, bounds.aspectRatioMax, fallback.aspectRatio),
    offsetX: clampSetting(input.offsetX, -8192, 8192, fallback.offsetX),
    offsetY: clampSetting(input.offsetY, -8192, 8192, fallback.offsetY),
  };
}

export function clampTransformParamsToSize(
  transform: TransformParams,
  width: number,
  height: number,
  bounds: TransformParamBounds = TRANSFORM_PARAM_BOUNDS_DEFAULT,
): TransformParams {
  const safeWidth = Math.max(1, Number.isFinite(width) ? width : 1);
  const safeHeight = Math.max(1, Number.isFinite(height) ? height : 1);
  const sanitized = sanitizeTransformParams(transform, TRANSFORM_PARAMS_DEFAULTS, bounds);
  return {
    ...sanitized,
    offsetX: clampSetting(transform.offsetX, -safeWidth, safeWidth, 0),
    offsetY: clampSetting(transform.offsetY, -safeHeight, safeHeight, 0),
  };
}

export function isDefaultTransformParams(value: TransformParams) {
  return Math.abs(value.scale - TRANSFORM_PARAMS_DEFAULTS.scale) < 0.0001
    && Math.abs(value.aspectRatio - TRANSFORM_PARAMS_DEFAULTS.aspectRatio) < 0.0001
    && Math.abs(value.offsetX - TRANSFORM_PARAMS_DEFAULTS.offsetX) < 0.0001
    && Math.abs(value.offsetY - TRANSFORM_PARAMS_DEFAULTS.offsetY) < 0.0001;
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

export function sanitizeSmudgeDistortionEffect(raw: unknown): SmudgeDistortionEffect {
  const input = raw && typeof raw === 'object' ? raw as Partial<SmudgeDistortionEffect> : {};
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
          brushSize: clampSetting(stroke.brushSize, 4, 400, 176),
          brushStrength: clampSetting(stroke.brushStrength, 0, 1, 0.64),
          brushFeather: clampSetting(stroke.brushFeather, 0, 400, 80),
        };
      }).filter((item): item is SmudgeDistortionStroke => item !== null).slice(-80)
    : [];

  return {
    type: 'smudgeDistortion',
    enabled: typeof input.enabled === 'boolean' ? input.enabled : true,
    transform: sanitizeTransformParams(input.transform),
    strength: clampSetting(input.strength, 0, 1, 1),
    precision: Math.round(clampSetting(input.precision, 1, 4, 2)),
    brushEnabled: typeof input.brushEnabled === 'boolean' ? input.brushEnabled : true,
    brushSize: clampSetting(input.brushSize, 4, 400, 176),
    brushStrength: clampSetting(input.brushStrength, 0, 1, 0.64),
    brushFeather: clampSetting(input.brushFeather, 0, 400, 80),
    strokes,
  };
}

export function sanitizePaintMaskEffect(raw: unknown): PaintMaskEffect {
  const input = raw && typeof raw === 'object' ? raw as Partial<PaintMaskEffect> : {};
  const strokes = Array.isArray(input.strokes)
    ? input.strokes.map(item => {
        if (!item || typeof item !== 'object') return null;
        const stroke = item as Partial<PaintMaskStroke>;
        const points = Array.isArray(stroke.points)
          ? stroke.points.map(sanitizeSmudgePoint).filter((point): point is SmudgeDistortionPoint => point !== null).slice(0, 400)
          : [];
        if (points.length < 1) return null;
        return {
          points,
          brush: stroke.brush === 'white' ? 'white' : 'black',
          brushSize: clampSetting(stroke.brushSize, 4, 400, 176),
          brushOpacity: clampSetting(stroke.brushOpacity, 0, 1, 0.1),
          brushFeather: clampSetting(stroke.brushFeather, 0, 400, 141),
        };
      }).filter((item): item is PaintMaskStroke => item !== null).slice(-80)
    : [];

  return {
    type: 'paintMask',
    enabled: typeof input.enabled === 'boolean' ? input.enabled : true,
    brushEnabled: typeof input.brushEnabled === 'boolean' ? input.brushEnabled : true,
    brush: input.brush === 'white' ? 'white' : 'black',
    brushSize: clampSetting(input.brushSize, 4, 400, 176),
    brushOpacity: clampSetting(input.brushOpacity, 0, 1, 0.1),
    brushFeather: clampSetting(input.brushFeather, 0, 400, 141),
    strokes,
  };
}

export function sanitizePixelGrainEffect(raw: unknown): PixelGrainEffect {
  const input = raw && typeof raw === 'object' ? raw as Partial<PixelGrainEffect> : {};
  return {
    type: 'pixelGrain',
    enabled: typeof input.enabled === 'boolean' ? input.enabled : true,
    amount: clampSetting(input.amount, 0, 1, 0.13),
    blendMode: input.blendMode === 'screen' || input.blendMode === 'multiply' || input.blendMode === 'softLight'
      ? input.blendMode
      : 'overlay',
    seed: Math.round(clampSetting(input.seed, 1, 9999, 173)),
  };
}

export function sanitizeDynamicImageEffect(raw: unknown): DynamicImageEffect {
  const input = raw && typeof raw === 'object' ? raw as Partial<DynamicImageEffect> : {};
  const algorithm = DYNAMIC_IMAGE_ALGORITHM_VALUES.includes(input.algorithm as TextureDynamicImageAlgorithm)
    ? input.algorithm as TextureDynamicImageAlgorithm
    : DEFAULT_DYNAMIC_IMAGE_ALGORITHM;
  const defaults = getDynamicImageAlgorithmDef(algorithm).defaults;
  return {
    type: 'dynamicImageEffect',
    enabled: typeof input.enabled === 'boolean' ? input.enabled : true,
    transform: sanitizeTransformParams(input.transform),
    algorithm,
    speed: clampSetting(input.speed, 0.01, 3, defaults.dynamicImageSpeed ?? 0.8),
    strength: clampSetting(input.strength, 0, 1, defaults.dynamicImageStrength ?? 0.44),
    paramA: clampSetting(input.paramA, 0, 128, defaults.dynamicImageParamA ?? 0.5),
    paramB: clampSetting(input.paramB, 0, 1, defaults.dynamicImageParamB ?? 0.35),
    opacity: clampSetting(input.opacity, 0, 1, defaults.dynamicImageOpacity ?? 1),
  };
}

export function sanitizeOutlinesEffect(raw: unknown): OutlinesEffect {
  const input = raw && typeof raw === 'object'
    ? raw as Partial<OutlinesEffect> & { gradient?: unknown }
    : {};
  const legacyGradient = typeof input.gradient === 'number' ? input.gradient : undefined;
  const gaussianSamples = Math.round((clampSetting(input.gaussianSamples, 3, 9, 7) - 3) / 2) * 2 + 3;
  return {
    type: 'outlines',
    enabled: typeof input.enabled === 'boolean' ? input.enabled : true,
    inputMode: input.inputMode === 'inverseLuma' || input.inputMode === 'alpha' ? input.inputMode : 'luma',
    threshold: clampSetting(input.threshold, 0.05, 0.95, 0.54),
    count: Math.round(clampSetting(input.count, 2, 24, 18)),
    fieldScale: clampSetting(input.fieldScale ?? legacyGradient, 0, 0.6, 0.1),
    lineGradientStops: sanitizeGradientStops(input.lineGradientStops, OUTLINES_DEFAULT_LINE_GRADIENT),
    thickness: clampSetting(input.thickness, 0.5, 4, 1.2),
    spacing: clampSetting(input.spacing, 0.5, 4, 1),
    softness: clampSetting(input.softness, 0, 1, 0.45),
    offset: clampSetting(input.offset, -0.5, 0.5, 0),
    phase: clampSetting(input.phase, 0, 1, 0.1),
    smoothing: clampSetting(input.smoothing, 0, 5, 1.6),
    gaussianSamples,
    animationEnabled: typeof input.animationEnabled === 'boolean' ? input.animationEnabled : false,
    speed: clampSetting(input.speed, 0, 1.5, 0.18),
  };
}

export function sanitizeTextureEffect(raw: unknown): TextureEffect {
  const input = raw && typeof raw === 'object' ? raw as Partial<TextureEffect> : {};
  if (input.type === 'paintMask') return sanitizePaintMaskEffect(input);
  if (input.type === 'pixelGrain') return sanitizePixelGrainEffect(input);
  if (input.type === 'dynamicImageEffect') return sanitizeDynamicImageEffect(input);
  if (input.type === 'outlines') return sanitizeOutlinesEffect(input);
  return sanitizeSmudgeDistortionEffect(input);
}

export function sanitizeGradientStops(raw: unknown, fallback = TEXTURE_DEFAULTS.gradientStops): GradientColorStop[] {
  if (!Array.isArray(raw) || raw.length < 2) return fallback;
  const isAlreadyValid = raw.length <= 8
    && raw.every((item, index) => {
      if (!item || typeof item !== 'object') return false;
      const stop = item as Partial<GradientColorStop>;
      if (typeof stop.position !== 'number' || !Number.isFinite(stop.position) || stop.position < 0 || stop.position > 1) return false;
      if (typeof stop.opacity !== 'number' || !Number.isFinite(stop.opacity) || stop.opacity < 0 || stop.opacity > 1) return false;
      if (typeof stop.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(stop.color)) return false;
      if (index > 0) {
        const prev = raw[index - 1];
        if (!prev || typeof prev !== 'object') return false;
        const prevStop = prev as Partial<GradientColorStop>;
        if (typeof prevStop.position !== 'number' || stop.position < prevStop.position) return false;
      }
      return true;
    });
  if (isAlreadyValid) return raw as GradientColorStop[];
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
  const legacyInput = input as Partial<TextureSettings> & {
    gradientFlowScale?: number;
    gradientFlowAspectRatio?: number;
    gradientFlowScaleX?: number;
    gradientFlowScaleY?: number;
  };
  const textureType: TextureType = (['halftone', 'gradient', 'dynamicImage'] as const).includes(input.textureType as TextureType)
    ? input.textureType as TextureType
    : input.gradientEnabled === true
      ? 'gradient'
      : TEXTURE_DEFAULTS.textureType;
  const defaults = getTextureDefaults(textureType);
  const dynamicImageAlgorithm = DYNAMIC_IMAGE_ALGORITHM_VALUES.includes(input.dynamicImageAlgorithm as TextureDynamicImageAlgorithm)
    ? input.dynamicImageAlgorithm as TextureDynamicImageAlgorithm
    : defaults.dynamicImageAlgorithm;
  const legacyTransform: Partial<TransformParams> = textureType === 'halftone'
    ? {
      scale: input.spotScale,
      offsetX: input.spotOffsetX,
      offsetY: input.spotOffsetY,
      aspectRatio: 1,
    }
    : textureType === 'gradient'
      ? {
        scale: legacyInput.gradientFlowScale ?? legacyInput.gradientFlowScaleX ?? defaults.transform.scale,
        aspectRatio: legacyInput.gradientFlowAspectRatio
          ?? (typeof legacyInput.gradientFlowScaleY === 'number' && typeof legacyInput.gradientFlowScaleX === 'number' && legacyInput.gradientFlowScaleX > 0
            ? legacyInput.gradientFlowScaleY / legacyInput.gradientFlowScaleX
            : defaults.transform.aspectRatio),
        offsetX: defaults.transform.offsetX,
        offsetY: defaults.transform.offsetY,
      }
      : {
        scale: input.dynamicImageScale,
        aspectRatio: input.dynamicImageAspectRatio,
        offsetX: input.dynamicImageOffsetX,
        offsetY: input.dynamicImageOffsetY,
      };
  const transformBounds = textureType === 'gradient'
    ? GRADIENT_ALGO_TRANSFORM_PARAM_BOUNDS
    : TRANSFORM_PARAM_BOUNDS_DEFAULT;
  const transform = sanitizeTransformParams(
    input.transform ?? legacyTransform,
    defaults.transform ?? TRANSFORM_PARAMS_DEFAULTS,
    transformBounds,
  );
  return {
    textureType,
    enabled: true,
    transform,
    animEnabled: typeof input.animEnabled === 'boolean' ? input.animEnabled : defaults.animEnabled,
    animType: (['drift', 'breathe', 'vortex', 'wave', 'float'] as const).includes(input.animType as any) ? input.animType as TextureAnimType : defaults.animType,
    speed: clampSetting(input.speed, 1, 10, defaults.speed),
    directionDeg: clampSetting(input.directionDeg, 0, 360, defaults.directionDeg),
    coherence: clampSetting(input.coherence, 0, 2, defaults.coherence),
    spotCount: Math.round(clampSetting(input.spotCount, 1, 40, defaults.spotCount)),
    spotSize: clampSetting(input.spotSize, 8, 500, defaults.spotSize),
    spotBlur: clampSetting(input.spotBlur, 0, 200, defaults.spotBlur),
    spotType: (['gaussian', 'wave', 'cellular', 'ripple', 'streak'] as const).includes(input.spotType as any) ? input.spotType as TextureSpotType : defaults.spotType,
    spotScale: transform.scale,
    spotOffsetX: transform.offsetX,
    spotOffsetY: transform.offsetY,
    spotMaskEnabled: false,
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
    gradientAnimType: GRADIENT_ANIM_TYPE_VALUES.includes(input.gradientAnimType as TextureGradientAnimType) ? input.gradientAnimType as TextureGradientAnimType : defaults.gradientAnimType,
    gradientFlowRotation: clampSetting(input.gradientFlowRotation, 0, 360, defaults.gradientFlowRotation),
    gradientFlowWarp: clampSetting(input.gradientFlowWarp, 0, 6, defaults.gradientFlowWarp),
    gradientFlowSoftness: clampSetting(input.gradientFlowSoftness, 0, 1, defaults.gradientFlowSoftness),
    gradientFlowComplexity: Math.round(clampSetting(input.gradientFlowComplexity, 1, 6, defaults.gradientFlowComplexity)),
    gradientFlowParamA: clampSetting(input.gradientFlowParamA, 0, 16, defaults.gradientFlowParamA),
    gradientFlowParamB: clampSetting(input.gradientFlowParamB, 0, 1, defaults.gradientFlowParamB),
    gradientAnimEnabled: typeof input.gradientAnimEnabled === 'boolean' ? input.gradientAnimEnabled : defaults.gradientAnimEnabled,
    gradientAnimSpeed: clampSetting(input.gradientAnimSpeed, 0.01, 1, defaults.gradientAnimSpeed),
    gradientAnimIntensity: clampSetting(input.gradientAnimIntensity, 0, 1, defaults.gradientAnimIntensity),
    gradientAnimDirection: clampSetting(input.gradientAnimDirection, 0, 360, defaults.gradientAnimDirection),
    dynamicImageFit: input.dynamicImageFit === 'contain' ? 'contain' : defaults.dynamicImageFit,
    dynamicImageAssetId: typeof input.dynamicImageAssetId === 'string' ? input.dynamicImageAssetId.slice(0, 96) : defaults.dynamicImageAssetId,
    dynamicImageAssetName: typeof input.dynamicImageAssetName === 'string' ? input.dynamicImageAssetName.slice(0, 120) : defaults.dynamicImageAssetName,
    dynamicImageAssetWidth: Math.round(clampSetting(input.dynamicImageAssetWidth, 0, 8192, defaults.dynamicImageAssetWidth)),
    dynamicImageAssetHeight: Math.round(clampSetting(input.dynamicImageAssetHeight, 0, 8192, defaults.dynamicImageAssetHeight)),
    dynamicImageAlgorithm,
    dynamicImageScale: transform.scale,
    dynamicImageAspectRatio: transform.aspectRatio,
    dynamicImageOffsetX: transform.offsetX,
    dynamicImageOffsetY: transform.offsetY,
    dynamicImageSpeed: clampSetting(input.dynamicImageSpeed, 0.01, 3, defaults.dynamicImageSpeed),
    dynamicImageStrength: clampSetting(input.dynamicImageStrength, 0, 1, defaults.dynamicImageStrength),
    dynamicImageParamA: clampSetting(input.dynamicImageParamA, 0, 128, defaults.dynamicImageParamA),
    dynamicImageParamB: clampSetting(input.dynamicImageParamB, 0, 1, defaults.dynamicImageParamB),
    dynamicImageOpacity: clampSetting(input.dynamicImageOpacity, 0, 1, defaults.dynamicImageOpacity),
  };
}

export function sanitizePresetLayerState(raw: unknown): TexturePresetLayerState {
  if (raw && typeof raw === 'object' && Array.isArray((raw as Partial<TexturePresetLayerState>).layers)) {
    const input = raw as Partial<TexturePresetLayerState>;
    const layers = (input.layers ?? [])
      .map((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const layer = item as Partial<TexturePresetLayer> & { settings?: unknown; blendMode?: unknown; filter?: unknown; effect?: unknown; kind?: unknown; visible?: unknown };
        const id = typeof layer.id === 'string' && layer.id.trim() ? layer.id.trim() : `layer-${index + 1}`;
        const visible = layer.visible !== false;
        const rawKind = (layer as { kind?: unknown }).kind;
        if (rawKind === 'effect' || rawKind === 'filter') {
          return {
            id,
            kind: 'effect',
            name: typeof layer.name === 'string' && layer.name.trim() ? layer.name.trim() : `效果${index + 1}`,
            visible,
            effect: sanitizeTextureEffect(layer.effect ?? layer.filter),
          };
        }
        return {
          id,
          kind: 'texture',
          name: typeof layer.name === 'string' && layer.name.trim() ? layer.name.trim() : `图层${index + 1}`,
          visible,
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
    visible: true,
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
    : presets[0]?.id ?? null;
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
