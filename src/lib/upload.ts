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

/** Valida e sobe as imagens; retorna as URLs públicas na ordem. Lança Error com mensagem amigável. */
export async function uploadImages(bucket: string, list: FileList | File[]): Promise<string[]> {
  const files = Array.from(list);
  for (const f of files) {
    if (!ACCEPTED_TYPES[f.type]) throw new Error(`Formato não suportado: ${f.name} — use JPG, PNG ou WebP.`);
    if (f.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`${f.name} passa de ${MAX_FILE_MB} MB.`);
  }
  const supabase = createBrowserSupabase();
  const urls: string[] = [];
  for (const f of files) {
    const path = `${crypto.randomUUID()}.${ACCEPTED_TYPES[f.type]}`;
    const { error } = await supabase.storage.from(bucket).upload(path, f);
    if (error) throw new Error(error.message);
    urls.push(supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl);
  }
  return urls;
}
