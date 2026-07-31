import { describe, it, expect } from 'vitest';
import { ModelGenerateBodySchema } from '@/app/api/models/generate/schema';
import { BatchBodySchema } from '@/app/api/batches/schema';

const uuid = '4c1f1e07-4a3e-4b6e-9d1a-3a2b1c0d9e8f';

describe('ModelGenerateBodySchema', () => {
  it('default do motor é gpt-image-2 e aceita nano-banana-2', () => {
    expect(ModelGenerateBodySchema.parse({ region: 'br' }).imageEngine).toBe('gpt-image-2');
    expect(ModelGenerateBodySchema.parse({ region: 'us', imageEngine: 'nano-banana-2' }).imageEngine).toBe('nano-banana-2');
  });
  it('rejeita motor fora do registro', () => {
    expect(ModelGenerateBodySchema.safeParse({ region: 'br', imageEngine: 'dall-e' }).success).toBe(false);
  });
});

describe('BatchBodySchema', () => {
  const base = { modelId: uuid, productId: uuid, videoCount: 3, durationSeconds: 5 };
  it('defaults preservam o comportamento atual', () => {
    const p = BatchBodySchema.parse(base);
    expect(p.imageEngine).toBe('gpt-image-2');
    expect(p.videoEngine).toBe('seedance-2-mini-image-to-video');
  });
  it('aceita qualquer um dos 9 tiers de vídeo', () => {
    expect(BatchBodySchema.parse({ ...base, videoEngine: 'seedance-2-vip-image-to-video-4k' }).videoEngine)
      .toBe('seedance-2-vip-image-to-video-4k');
  });
  it('rejeita tier fora do registro', () => {
    expect(BatchBodySchema.safeParse({ ...base, videoEngine: 'seedance-2-spicy-image-to-video' }).success).toBe(false);
  });
});
