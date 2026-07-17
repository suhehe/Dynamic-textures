export type DynamicImageAsset = {
  id: string;
  name: string;
  objectUrl: string;
  mimeType: string;
  fileSize: number;
  sourceWidth: number;
  sourceHeight: number;
  width: number;
  height: number;
  canvas: HTMLCanvasElement;
};

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_TEXTURE_EDGE = 4096;

function nextAssetId() {
  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function decodeObjectUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('无法解码该图像'));
    image.src = url;
  });
}

function drawNormalizedCanvas(image: HTMLImageElement, maxEdge = MAX_TEXTURE_EDGE) {
  const sourceWidth = Math.max(1, image.naturalWidth || image.width || 1);
  const sourceHeight = Math.max(1, image.naturalHeight || image.height || 1);
  const longest = Math.max(sourceWidth, sourceHeight);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('浏览器无法创建 2D 画布上下文');
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, sourceWidth, sourceHeight, 0, 0, width, height);
  return { canvas, sourceWidth, sourceHeight, width, height };
}

export async function loadDynamicImageFile(file: File): Promise<DynamicImageAsset> {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error('仅支持 PNG、JPEG、WebP 图像');
  }
  if (file.size <= 0) {
    throw new Error('文件内容为空，请重新选择图像');
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('图片过大，请选择 20MB 以内的文件');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await decodeObjectUrl(objectUrl);
    const normalized = drawNormalizedCanvas(image);
    return {
      id: nextAssetId(),
      name: file.name || '未命名图像',
      objectUrl,
      mimeType: file.type,
      fileSize: file.size,
      sourceWidth: normalized.sourceWidth,
      sourceHeight: normalized.sourceHeight,
      width: normalized.width,
      height: normalized.height,
      canvas: normalized.canvas,
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

export function releaseDynamicImageAsset(asset: DynamicImageAsset | null | undefined) {
  if (!asset) return;
  URL.revokeObjectURL(asset.objectUrl);
}
