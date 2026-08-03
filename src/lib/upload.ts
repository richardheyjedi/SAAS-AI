import { createBrowserSupabase } from './supabase/browser';

// Upload client-side de imagens para um bucket público do Supabase Storage.
// Validação espelha os limites server-side dos buckets (8 MB, jpg/png/webp).
export const UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp';

const ACCEPTED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_FILE_MB = 8;

/** Lança Error com mensagem amigável quando o arquivo não serve. */
export function validateImageFile(f: File): void {
  if (!ACCEPTED_TYPES[f.type]) throw new Error(`Formato não suportado: ${f.name} — use JPG, PNG ou WebP.`);
  if (f.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`${f.name} passa de ${MAX_FILE_MB} MB.`);
}

/**
 * Valida e sobe UMA imagem; retorna a URL pública. Quem chama faz o loop e
 * persiste incrementalmente — falha no arquivo N preserva os N-1 anteriores.
 */
export async function uploadImage(bucket: string, f: File): Promise<string> {
  validateImageFile(f);
  const supabase = createBrowserSupabase();
  const path = `${crypto.randomUUID()}.${ACCEPTED_TYPES[f.type]}`;
  const { error } = await supabase.storage.from(bucket).upload(path, f);
  if (error) throw new Error(error.message);
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
