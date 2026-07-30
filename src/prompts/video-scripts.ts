import type { Persona } from '@/types';

export const scriptsSystemPrompt = `Você roteiriza vídeos curtos de TikTok Shop estrelados por uma creator virtual.
Responda SOMENTE com JSON: {"scripts":[{"title","hook","scene_description","motion_prompt"}]}.
"scene_description": em inglês, descreve UMA imagem estática (a creator com o produto, cenário, enquadramento vertical 9:16, estilo foto de celular) — será usada para compor a imagem base.
"motion_prompt": em inglês, descreve o movimento a partir dessa imagem (gestos, expressão, câmera handheld) para um clipe curto.
"title" e "hook": no idioma da persona. Varie ângulos de venda entre os roteiros (unboxing, prova, antes/depois, 3 formas de usar, review sincera...). Nada de texto fora do JSON.`;

export function scriptsUserPrompt(input: {
  persona: Persona; productTitle: string; productDescription: string; count: number; durationSeconds: number;
}): string {
  const p = input.persona;
  return [
    `Persona: ${p.name}, ${p.age} anos, ${p.niche}. Aparência: ${p.appearance}. Personalidade: ${p.personality}. Fala: ${p.speech_style}.`,
    `Produto: ${input.productTitle} — ${input.productDescription}`,
    `Gere exatamente ${input.count} roteiros para clipes de ${input.durationSeconds} segundos.`,
    'Retorne apenas o JSON.',
  ].join('\n');
}
