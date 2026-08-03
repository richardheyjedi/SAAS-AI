import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * Exclui o modelo e tudo que depende dele: vídeos e lotes (sem cascade no
 * banco) e referências (image_jobs têm cascade). Ação confirmada na UI.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { data: batches } = await supabase.from('video_batches').select('id').eq('model_id', id);
  const batchIds = (batches ?? []).map((b) => b.id);
  if (batchIds.length > 0) {
    const { error: jobsErr } = await supabase.from('video_jobs').delete().in('batch_id', batchIds);
    if (jobsErr) {
      console.error('models DELETE jobs:', jobsErr.message);
      return NextResponse.json({ error: 'Não foi possível excluir os vídeos da modelo.' }, { status: 500 });
    }
    const { error: batchErr } = await supabase.from('video_batches').delete().in('id', batchIds);
    if (batchErr) {
      console.error('models DELETE batches:', batchErr.message);
      return NextResponse.json({ error: 'Não foi possível excluir os lotes da modelo.' }, { status: 500 });
    }
  }
  const { error } = await supabase.from('models').delete().eq('id', id);
  if (error) {
    console.error('models DELETE:', error.message);
    return NextResponse.json({ error: 'Não foi possível excluir a modelo.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
