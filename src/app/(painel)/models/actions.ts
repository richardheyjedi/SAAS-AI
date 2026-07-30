'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';

export async function approveModel(modelId: string) {
  const supabase = await createServerSupabase();
  await supabase.from('models').update({ status: 'approved' }).eq('id', modelId);
  revalidatePath('/models');
}
