import { describe, it, expect } from 'vitest';
import { PersonaSchema, ScriptListSchema, STATUS_LABEL } from '@/types';

const persona = {
  name: 'Larissa', age: 26, region: 'br',
  appearance: 'mulher brasileira, 26 anos, cabelo castanho ondulado, sorriso aberto',
  personality: 'espontânea, energia alta, próxima do público',
  speech_style: 'português carioca com gírias leves',
  niche: 'moda feminina',
  image_prompt: 'ultra realistic photo of a 26 year old brazilian woman, wavy brown hair, natural light, phone camera style',
};

describe('PersonaSchema', () => {
  it('aceita persona válida', () => {
    expect(PersonaSchema.parse(persona).name).toBe('Larissa');
  });
  it('rejeita região desconhecida e idade fora da faixa', () => {
    expect(() => PersonaSchema.parse({ ...persona, region: 'jp' })).toThrow();
    expect(() => PersonaSchema.parse({ ...persona, age: 15 })).toThrow();
  });
});

describe('ScriptListSchema', () => {
  it('valida lista de roteiros', () => {
    const s = {
      title: 'Unboxing espontâneo',
      hook: 'gente, olha o que chegou',
      scene_description: 'a modelo segurando o vestido midi canelado, quarto iluminado, estilo selfie',
      motion_prompt: 'she holds up the dress, smiles and turns it to show the fabric, handheld phone camera',
    };
    expect(ScriptListSchema.parse({ scripts: [s] }).scripts).toHaveLength(1);
    expect(() => ScriptListSchema.parse({ scripts: [] })).toThrow();
  });
});

describe('STATUS_LABEL', () => {
  it('tem rótulo pt-BR para todo status', () => {
    expect(STATUS_LABEL.queued).toBe('Na fila');
    expect(STATUS_LABEL.completed).toBe('Pronto');
  });
});
