// Fonte única dos rótulos de exibição — o drift entre telas já aconteceu
// uma vez (rename neutro só pegou 1 de 4 cópias); tudo importa daqui.

export const REGION_LABEL: Record<string, string> = {
  br: '🇧🇷 Brasil',
  us: '🇺🇸 EUA',
  us_latina: '🇺🇸 EUA · Latino(a)',
  custom: 'Personalizada',
};

export const MODEL_STATUS_INFO: Record<string, { label: string; cls: string }> = {
  generating_refs: { label: 'Gerando referências…', cls: 'p-cyan' },
  pending_approval: { label: 'Revisar e aprovar', cls: 'p-warn' },
  approved: { label: '✓ Pronta para vídeos', cls: 'p-ok' },
};

/** Relações do Supabase chegam como objeto OU array conforme o embed — normaliza. */
export function one<T>(rel: T | T[] | null): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}
