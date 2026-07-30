import { describe, it, expect } from 'vitest';
import { batchCostUsd, videoCostUsd, usdToBrl } from '@/lib/cost';

describe('custo', () => {
  it('vídeo de 5s custa 0.45 (0.40 vídeo + 0.05 imagem)', () => {
    expect(videoCostUsd(5)).toBe(0.45);
  });
  it('vídeo de 10s custa 0.85', () => {
    expect(videoCostUsd(10)).toBe(0.85);
  });
  it('lote de 20 vídeos de 5s custa 9.05 (inclui 0.05 de roteiros)', () => {
    expect(batchCostUsd(20, 5)).toBe(9.05);
  });
  it('lote de 1 vídeo de 5s custa 0.50', () => {
    expect(batchCostUsd(1, 5)).toBe(0.5);
  });
  it('conversão aproximada para BRL a 5.00', () => {
    expect(usdToBrl(9.05)).toBe(45.25);
  });
});
