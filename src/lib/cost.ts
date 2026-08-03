import { imageEngine, videoEngine } from './engines';

export const SCRIPTS_USD_FLAT = 0.05;
export const USD_TO_BRL = 5;

const round2 = (v: number) => Math.round(v * 100) / 100;

export function imageCostUsd(imageEngineId: string): number {
  return imageEngine(imageEngineId).usdPerImage;
}

// O catálogo dá o preço do clipe de 5s; outras durações são extrapoladas
// linearmente (validado para o Mini; estimativa para os demais tiers).
export function videoCostUsd(videoEngineId: string, durationSeconds: number): number {
  return round2(videoEngine(videoEngineId).usdBase5s * (durationSeconds / 5));
}

export function batchCostUsd(
  imageEngineId: string, videoEngineId: string, videoCount: number, durationSeconds: number,
): number {
  const perVideo = videoCostUsd(videoEngineId, durationSeconds) + imageCostUsd(imageEngineId);
  return round2(videoCount * perVideo + SCRIPTS_USD_FLAT);
}

export function modelRefsCostUsd(imageEngineId: string, refCount: number): number {
  return round2(imageCostUsd(imageEngineId) * refCount);
}

export function usdToBrl(usd: number): number {
  return round2(usd * USD_TO_BRL);
}

export function formatUsd(v: number): string {
  return 'US$ ' + v.toFixed(2).replace('.', ',');
}
