import { describe, it, expect } from 'vitest';
import { batchCostUsd, imageCostUsd, modelRefsCostUsd, usdToBrl, videoCostUsd } from '@/lib/cost';

describe('custo por motor', () => {
  it('vídeo escala pelo preço base de 5s do tier', () => {
    expect(videoCostUsd('seedance-2-mini-image-to-video', 5)).toBe(0.2);
    expect(videoCostUsd('seedance-2-mini-image-to-video', 10)).toBe(0.4);
    expect(videoCostUsd('seedance-2-vip-image-to-video-4k', 10)).toBe(13.5);
    expect(videoCostUsd('seedance-2-i2v', 5)).toBe(0.75);
  });
  it('imagem custa o preço do motor', () => {
    expect(imageCostUsd('gpt-image-2')).toBe(0.09);
    expect(imageCostUsd('nano-banana-2')).toBe(0.06);
  });
  it('lote combina vídeo + imagem de composição + roteiros', () => {
    // 20 × (0.20 + 0.09) + 0.05
    expect(batchCostUsd('gpt-image-2', 'seedance-2-mini-image-to-video', 20, 5)).toBe(5.85);
    // 3 × (1.50 + 0.06) + 0.05
    expect(batchCostUsd('nano-banana-2', 'seedance-2-vip-image-to-video', 3, 5)).toBe(4.73);
  });
  it('projeção das referências do modelo', () => {
    expect(modelRefsCostUsd('gpt-image-2', 3)).toBe(0.27);
    expect(modelRefsCostUsd('nano-banana-2', 3)).toBe(0.18);
  });
  it('motor desconhecido lança erro', () => {
    expect(() => videoCostUsd('sora', 5)).toThrow(/desconhecido/);
    expect(() => imageCostUsd('dall-e')).toThrow(/desconhecido/);
  });
  it('conversão aproximada para BRL a 5.00', () => {
    expect(usdToBrl(5.85)).toBe(29.25);
  });
});
