import { describe, it, expect } from 'vitest';
import {
  IMAGE_ENGINES, VIDEO_ENGINES, IMAGE_ENGINE_IDS, VIDEO_ENGINE_IDS,
  DEFAULT_IMAGE_ENGINE, DEFAULT_VIDEO_ENGINE,
  imageEngine, videoEngine, videoEnginePath,
} from '@/lib/engines';

describe('registro de motores de imagem', () => {
  it('tem exatamente gpt-image-2 e nano-banana-2, com preços do catálogo', () => {
    expect(IMAGE_ENGINE_IDS).toEqual(['gpt-image-2', 'nano-banana-2']);
    expect(imageEngine('gpt-image-2').usdPerImage).toBe(0.09);
    expect(imageEngine('nano-banana-2').usdPerImage).toBe(0.06);
  });
  it('nano-banana-2 usa o endpoint -edit para image-to-image', () => {
    expect(imageEngine('nano-banana-2').t2iPath).toBe('/api/v1/nano-banana-2');
    expect(imageEngine('nano-banana-2').i2iPath).toBe('/api/v1/nano-banana-2-edit');
    expect(imageEngine('gpt-image-2').i2iPath).toBe('/api/v1/gpt-image-2-image-to-image');
  });
});

describe('registro de motores de vídeo', () => {
  it('tem os 9 tiers Seedance 2.0 com ids únicos', () => {
    expect(VIDEO_ENGINES).toHaveLength(9);
    expect(new Set(VIDEO_ENGINE_IDS).size).toBe(9);
  });
  it('preços de catálogo dos 9 tiers e só o Mini com resolution', () => {
    expect(VIDEO_ENGINES.map((e) => [e.id, e.usdBase5s])).toEqual([
      ['seedance-2-mini-image-to-video', 0.2],
      ['seedance-2-i2v-480p', 0.6],
      ['seedance-2-i2v', 0.75],
      ['seedance-2-image-to-video-fast', 0.75],
      ['seedance-2-image-to-video', 1.25],
      ['seedance-2-vip-image-to-video-fast', 1.05],
      ['seedance-2-vip-image-to-video', 1.5],
      ['seedance-2-vip-image-to-video-1080p', 3.375],
      ['seedance-2-vip-image-to-video-4k', 6.75],
    ]);
    expect(VIDEO_ENGINES.filter((e) => e.supportsResolution).map((e) => e.id))
      .toEqual(['seedance-2-mini-image-to-video']);
  });
  it('capacidades por tier batem com os input_schema da API (som só no Mini; bitrate no Mini e VIPs)', () => {
    expect(VIDEO_ENGINES.filter((e) => e.supportsAudio).map((e) => e.id))
      .toEqual(['seedance-2-mini-image-to-video']);
    expect(VIDEO_ENGINES.filter((e) => e.supportsHighBitrate).map((e) => e.id)).toEqual([
      'seedance-2-mini-image-to-video',
      'seedance-2-vip-image-to-video-fast',
      'seedance-2-vip-image-to-video',
    ]);
  });
  it('path deriva do id e defaults existem no registro', () => {
    expect(videoEnginePath(videoEngine('seedance-2-i2v'))).toBe('/api/v1/seedance-2-i2v');
    expect(IMAGE_ENGINE_IDS).toContain(DEFAULT_IMAGE_ENGINE);
    expect(VIDEO_ENGINE_IDS).toContain(DEFAULT_VIDEO_ENGINE);
  });
  it('id desconhecido lança erro', () => {
    expect(() => imageEngine('sora')).toThrow(/desconhecido/);
    expect(() => videoEngine('kling')).toThrow(/desconhecido/);
  });
});
