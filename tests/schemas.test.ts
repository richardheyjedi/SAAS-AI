import { describe, it, expect } from 'vitest';
import { ModelGenerateBodySchema } from '@/app/api/models/generate/schema';
import { BatchBodySchema } from '@/app/api/batches/schema';
import { NewRefsBodySchema } from '@/app/api/models/[id]/refs/schema';
import { ProductUpdateSchema } from '@/app/api/products/[id]/schema';

const uuid = '4c1f1e07-4a3e-4b6e-9d1a-3a2b1c0d9e8f';

describe('ModelGenerateBodySchema', () => {
  it('default do motor é gpt-image-2 e aceita nano-banana-2', () => {
    expect(ModelGenerateBodySchema.parse({ region: 'br' }).imageEngine).toBe('gpt-image-2');
    expect(ModelGenerateBodySchema.parse({ region: 'us', imageEngine: 'nano-banana-2' }).imageEngine).toBe('nano-banana-2');
  });
  it('rejeita motor fora do registro', () => {
    expect(ModelGenerateBodySchema.safeParse({ region: 'br', imageEngine: 'dall-e' }).success).toBe(false);
  });
  it('aceita refCount 0 quando há referências anexadas', () => {
    const p = ModelGenerateBodySchema.parse({
      region: 'br', refCount: 0, referenceUrls: ['https://cdn/x.jpg'],
    });
    expect(p.refCount).toBe(0);
    expect(p.referenceUrls).toEqual(['https://cdn/x.jpg']);
  });
  it('rejeita refCount 0 sem nenhuma referência', () => {
    const r = ModelGenerateBodySchema.safeParse({ region: 'br', refCount: 0 });
    expect(r.success).toBe(false);
  });
  it('rejeita URL inválida e mais de 10 URLs', () => {
    expect(ModelGenerateBodySchema.safeParse({ region: 'br', referenceUrls: ['nao-e-url'] }).success).toBe(false);
    const many = Array.from({ length: 11 }, (_, i) => `https://cdn/${i}.jpg`);
    expect(ModelGenerateBodySchema.safeParse({ region: 'br', referenceUrls: many }).success).toBe(false);
  });
  it('default de referenceUrls é lista vazia', () => {
    expect(ModelGenerateBodySchema.parse({ region: 'br' }).referenceUrls).toEqual([]);
  });
  it('sexo: default feminino, aceita masculino, rejeita valor fora do enum', () => {
    expect(ModelGenerateBodySchema.parse({ region: 'br' }).gender).toBe('female');
    expect(ModelGenerateBodySchema.parse({ region: 'br', gender: 'male' }).gender).toBe('male');
    expect(ModelGenerateBodySchema.safeParse({ region: 'br', gender: 'outro' }).success).toBe(false);
  });
  it('aceita productId uuid opcional e rejeita id inválido', () => {
    expect(ModelGenerateBodySchema.parse({ region: 'br', productId: uuid }).productId).toBe(uuid);
    expect(ModelGenerateBodySchema.parse({ region: 'br' }).productId).toBeUndefined();
    expect(ModelGenerateBodySchema.safeParse({ region: 'br', productId: 'nao-uuid' }).success).toBe(false);
  });
});

describe('BatchBodySchema', () => {
  const base = { modelId: uuid, productId: uuid, videoCount: 3, durationSeconds: 5 };
  it('defaults preservam o comportamento atual', () => {
    const p = BatchBodySchema.parse(base);
    expect(p.imageEngine).toBe('gpt-image-2');
    expect(p.videoEngine).toBe('seedance-2-mini-image-to-video');
    expect(p.generateAudio).toBe(true);
    expect(p.highBitrate).toBe(false);
    expect(p.aspectRatio).toBe('9:16');
    expect(p.resolution).toBe('720p');
  });
  it('duração aceita o intervalo real da API (4 a 15s)', () => {
    expect(BatchBodySchema.parse({ ...base, durationSeconds: 4 }).durationSeconds).toBe(4);
    expect(BatchBodySchema.parse({ ...base, durationSeconds: 15 }).durationSeconds).toBe(15);
    expect(BatchBodySchema.safeParse({ ...base, durationSeconds: 3 }).success).toBe(false);
    expect(BatchBodySchema.safeParse({ ...base, durationSeconds: 16 }).success).toBe(false);
  });
  it('aceita controles de som, formato, resolução e bitrate; rejeita valores fora do enum', () => {
    const p = BatchBodySchema.parse({ ...base, generateAudio: false, highBitrate: true, aspectRatio: '16:9', resolution: '480p' });
    expect(p.generateAudio).toBe(false);
    expect(p.highBitrate).toBe(true);
    expect(p.aspectRatio).toBe('16:9');
    expect(p.resolution).toBe('480p');
    expect(BatchBodySchema.safeParse({ ...base, aspectRatio: '21:9' }).success).toBe(false);
    expect(BatchBodySchema.safeParse({ ...base, resolution: '1080p' }).success).toBe(false);
  });
  it('aceita qualquer um dos 9 tiers de vídeo', () => {
    expect(BatchBodySchema.parse({ ...base, videoEngine: 'seedance-2-vip-image-to-video-4k' }).videoEngine)
      .toBe('seedance-2-vip-image-to-video-4k');
  });
  it('rejeita tier fora do registro', () => {
    expect(BatchBodySchema.safeParse({ ...base, videoEngine: 'seedance-2-spicy-image-to-video' }).success).toBe(false);
  });
});

describe('ProductUpdateSchema', () => {
  it('aceita edição completa e preço nulo (remove o preço)', () => {
    const p = ProductUpdateSchema.parse({ title: 'Vestido midi', priceBrl: null, imageUrls: ['https://cdn/a.jpg'] });
    expect(p.priceBrl).toBeNull();
    expect(p.description).toBe('');
  });
  it('rejeita título curto, preço negativo e URL inválida', () => {
    expect(ProductUpdateSchema.safeParse({ title: 'a', priceBrl: null }).success).toBe(false);
    expect(ProductUpdateSchema.safeParse({ title: 'Vestido', priceBrl: -5 }).success).toBe(false);
    expect(ProductUpdateSchema.safeParse({ title: 'Vestido', priceBrl: null, imageUrls: ['x'] }).success).toBe(false);
  });
});

describe('NewRefsBodySchema', () => {
  it('defaults: 3 novas referências, ajuste opcional', () => {
    const p = NewRefsBodySchema.parse({});
    expect(p.count).toBe(3);
    expect(p.adjustPrompt).toBeUndefined();
  });
  it('aceita ajuste e contagem 1-5; rejeita fora do intervalo', () => {
    expect(NewRefsBodySchema.parse({ adjustPrompt: 'cabelo preso', count: 5 }).count).toBe(5);
    expect(NewRefsBodySchema.safeParse({ count: 0 }).success).toBe(false);
    expect(NewRefsBodySchema.safeParse({ count: 6 }).success).toBe(false);
    expect(NewRefsBodySchema.safeParse({ adjustPrompt: 'x'.repeat(1001) }).success).toBe(false);
  });
});
