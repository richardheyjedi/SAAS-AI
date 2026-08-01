'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';

function revalidateModel(modelId: string) {
  revalidatePath('/models');
  revalidatePath(`/models/${modelId}`);
}

export async function approveModel(modelId: string) {
  const supabase = await createServerSupabase();
  await supabase.from('models').update({ status: 'approved' }).eq('id', modelId);
  revalidateModel(modelId);
}

/** Remove uma referência do modelo. A última referência nunca é removida (a composição depende dela). */
export async function removeModelReference(modelId: string, url: string) {
  const supabase = await createServerSupabase();
  const { data: model } = await supabase
    .from('models').select('reference_image_urls').eq('id', modelId).single();
  const refs: string[] = model?.reference_image_urls ?? [];
  const next = refs.filter((u) => u !== url);
  if (next.length === refs.length || next.length === 0) return;
  await supabase.from('models').update({ reference_image_urls: next }).eq('id', modelId);
  revalidateModel(modelId);
}

/** Move a referência para a posição 0 — ela vira a base usada na composição dos vídeos. */
export async function promoteModelReference(modelId: string, url: string) {
  const supabase = await createServerSupabase();
  const { data: model } = await supabase
    .from('models').select('reference_image_urls').eq('id', modelId).single();
  const refs: string[] = model?.reference_image_urls ?? [];
  if (!refs.includes(url) || refs[0] === url) return;
  const next = [url, ...refs.filter((u) => u !== url)];
  await supabase.from('models').update({ reference_image_urls: next }).eq('id', modelId);
  revalidateModel(modelId);
}

/** Anexa URLs de fotos já enviadas ao Storage como novas referências (ao final, sem duplicar). */
export async function addModelReferences(modelId: string, urls: string[]) {
  const clean = urls.filter((u) => typeof u === 'string' && /^https?:\/\//.test(u)).slice(0, 10);
  if (clean.length === 0) return;
  const supabase = await createServerSupabase();
  const { data: model } = await supabase
    .from('models').select('reference_image_urls').eq('id', modelId).single();
  if (!model) return;
  const refs: string[] = model.reference_image_urls ?? [];
  const next = [...refs, ...clean.filter((u) => !refs.includes(u))];
  await supabase.from('models').update({ reference_image_urls: next }).eq('id', modelId);
  revalidateModel(modelId);
}
