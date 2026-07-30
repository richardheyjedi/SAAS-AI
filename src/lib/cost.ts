export const VIDEO_USD_PER_SECOND = 0.08;
export const IMAGE_USD = 0.05;
export const SCRIPTS_USD_FLAT = 0.05;
export const USD_TO_BRL = 5;

const round2 = (v: number) => Math.round(v * 100) / 100;

export function videoCostUsd(durationSeconds: number): number {
  return round2(durationSeconds * VIDEO_USD_PER_SECOND + IMAGE_USD);
}

export function batchCostUsd(videoCount: number, durationSeconds: number): number {
  return round2(videoCount * videoCostUsd(durationSeconds) + SCRIPTS_USD_FLAT);
}

export function usdToBrl(usd: number): number {
  return round2(usd * USD_TO_BRL);
}
