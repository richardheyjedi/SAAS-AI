import type { Gender, Region } from '@/types';

export const personaSystemPrompt = `Você cria personas de creators virtuais para vídeos de TikTok Shop.
Responda SOMENTE com um objeto JSON, sem texto fora do JSON, com as chaves:
name, age (número), region, appearance, personality, speech_style, niche, image_prompt.
"image_prompt" deve ser em inglês, fotorrealista, estilo câmera de celular, descrevendo a pessoa de forma consistente e reutilizável (rosto, cabelo, idade, etnia, iluminação natural).
"region" deve ser exatamente o valor recebido no pedido.`;

const regionBrief: Record<Region, (g: Gender) => string> = {
  br: (g) => `${g === 'male' ? 'Homem brasileiro' : 'Mulher brasileira'}, 20-32 anos, tom espontâneo e caloroso, gírias brasileiras leves, estética de creator de TikTok Brasil.`,
  us: (g) => `${g === 'male' ? 'Homem americano' : 'Mulher americana'}, 20-32 anos, energia alta estilo GRWM/haul, inglês americano casual.`,
  us_latina: (g) => `${g === 'male' ? 'Homem latino' : 'Mulher latina'} nos EUA (ex: Miami), bilíngue inglês/espanhol, tom confiável de review.`,
  custom: () => 'Siga fielmente a descrição personalizada fornecida.',
};

export function personaUserPrompt(input: { region: Region; gender?: Gender; customPrompt?: string; productContext?: string }): string {
  const gender = input.gender ?? 'female';
  return [
    `Crie uma persona para region="${input.region}".`,
    `Sexo da persona: ${gender === 'male' ? 'masculino' : 'feminino'} (o image_prompt deve refletir isso).`,
    `Perfil regional: ${regionBrief[input.region](gender)}`,
    input.productContext
      ? `Esta creator vai vender o seguinte produto — alinhe nicho, personalidade e estilo a ele: ${input.productContext}`
      : '',
    input.customPrompt ? `Descrição personalizada do usuário (prioridade máxima): ${input.customPrompt}` : '',
    'Retorne apenas o JSON.',
  ].filter(Boolean).join('\n');
}
