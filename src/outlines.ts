export function getOutlinesBlurPassCount(gaussianSamples: number) {
  return Math.min(4, Math.max(1, Math.round((gaussianSamples - 1) / 2)));
}

export function getOutlinesBlurOffsets(smoothing: number, gaussianSamples: number) {
  const passCount = getOutlinesBlurPassCount(gaussianSamples);
  const sigmaPx = Math.min(5, Math.max(0, smoothing)) * 13;
  const normalizer = Math.sqrt(passCount * (passCount + 1) * (2 * passCount + 1) / 6);
  return Array.from({ length: passCount }, (_, index) => sigmaPx * (index + 1) / normalizer);
}
