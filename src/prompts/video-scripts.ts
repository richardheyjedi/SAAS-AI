import type { Persona, Region } from '@/types';

export const scriptsSystemPrompt = `Você roteiriza vídeos curtos de TikTok Shop estrelados por uma creator virtual.
Responda SOMENTE com JSON: {"scripts":[{"title","hook","scene_description","motion_prompt","speech"}]}.
"scene_description": em inglês, descreve UMA imagem estática (a creator com o produto, cenário, enquadramento vertical 9:16, estilo foto de celular) — será usada para compor a imagem base.
"motion_prompt": em inglês, descreve o movimento a partir dessa imagem (gestos, expressão, câmera handheld) para um clipe curto. NÃO inclua falas nem frases entre aspas aqui.
"speech": a fala exata que a creator diz olhando para a câmera, no idioma da persona — curta, natural, vendedora. Se o pedido disser que o vídeo não terá fala, omita a chave.
"title" e "hook": no idioma da persona. Varie ângulos de venda entre os roteiros (unboxing, prova, antes/depois, 3 formas de usar, review sincera...). Nada de texto fora do JSON.`;

/** Idioma falado por região da persona — usado para montar a instrução de voz. */
const SPEECH_LANGUAGE: Record<Region, string> = {
  br: 'Brazilian Portuguese',
  us: 'American English',
  us_latina: 'a natural mix of Spanish and English (Latina Spanglish)',
  custom: 'Brazilian Portuguese',
};

/**
 * Acopla a fala ao prompt de movimento no formato que gera voz sincronizada
 * no Seedance. Não duplica: se o movimento já contém uma fala (lotes antigos
 * com a frase embutida, ou LLM que desobedeceu a instrução), fica como está.
 * Aspas duplas na fala viram simples para não quebrar o formato do prompt.
 */
export function withSpokenLine(motionPrompt: string, speech: string, region: Region): string {
  const line = speech.trim().replace(/"/g, "'");
  if (!line) return motionPrompt;
  const alreadySpoken = /says in|diz em|fala(ndo)? em/i.test(motionPrompt)
    || motionPrompt.toLowerCase().includes(line.toLowerCase());
  if (alreadySpoken) return motionPrompt;
  return `${motionPrompt}. The creator looks directly at the camera and says in ${SPEECH_LANGUAGE[region]}: "${line}"`;
}

export function scriptsUserPrompt(input: {
  persona: Persona; productTitle: string; productDescription: string; count: number; durationSeconds: number;
  withSpeech?: boolean;
}): string {
  const p = input.persona;
  return [
    `Persona: ${p.name}, ${p.age} anos, ${p.niche}. Aparência: ${p.appearance}. Personalidade: ${p.personality}. Fala: ${p.speech_style}.`,
    `Produto: ${input.productTitle} — ${input.productDescription}`,
    `Gere exatamente ${input.count} roteiros para clipes de ${input.durationSeconds} segundos.`,
    input.withSpeech
      ? `IMPORTANTE — o vídeo terá voz gerada por IA: preencha a chave "speech" de cada roteiro com a fala exata da creator (no idioma da persona), curta o bastante para caber em ${input.durationSeconds} segundos. NÃO coloque a fala no motion_prompt.`
      : 'Este vídeo NÃO terá fala: omita a chave "speech".',
    'Retorne apenas o JSON.',
  ].filter(Boolean).join('\n');
}
