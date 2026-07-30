import { describe, it, expect, vi } from 'vitest';
import { generatePersona, generateScripts } from '@/lib/claude';
import type { Persona } from '@/types';

const persona: Persona = {
  name: 'Larissa', age: 26, region: 'br',
  appearance: 'mulher brasileira, cabelo castanho ondulado, sorriso aberto',
  personality: 'espontânea, energia alta, tom próximo',
  speech_style: 'carioca com gírias leves',
  niche: 'moda feminina',
  image_prompt: 'ultra realistic photo of a 26yo brazilian woman, wavy brown hair, phone camera style',
};

describe('generatePersona', () => {
  it('parseia JSON com fence e valida com Zod', async () => {
    const call = vi.fn(async () => '```json\n' + JSON.stringify(persona) + '\n```');
    const p = await generatePersona({ region: 'br' }, call);
    expect(p.name).toBe('Larissa');
    expect(call).toHaveBeenCalledOnce();
  });
  it('faz 1 retry quando o primeiro JSON é inválido', async () => {
    const call = vi.fn()
      .mockResolvedValueOnce('{"name":"x"}')
      .mockResolvedValueOnce(JSON.stringify(persona));
    const p = await generatePersona({ region: 'br' }, call);
    expect(p.age).toBe(26);
    expect(call).toHaveBeenCalledTimes(2);
  });
  it('propaga erro após retry falho', async () => {
    const call = vi.fn(async () => 'não é json');
    await expect(generatePersona({ region: 'us' }, call)).rejects.toThrow();
  });
});

describe('generateScripts', () => {
  it('retorna a lista validada', async () => {
    const script = {
      title: 'Unboxing espontâneo', hook: 'gente, chegou!',
      scene_description: 'modelo segurando o vestido midi, luz natural, estilo selfie de quarto',
      motion_prompt: 'she lifts the dress, smiles, turns it around, handheld camera feel',
    };
    const call = vi.fn(async () => JSON.stringify({ scripts: [script, script] }));
    const scripts = await generateScripts(
      { persona, productTitle: 'Vestido midi', productDescription: 'canelado', count: 2, durationSeconds: 5 },
      call,
    );
    expect(scripts).toHaveLength(2);
    expect(scripts[0].title).toBe('Unboxing espontâneo');
  });
});
