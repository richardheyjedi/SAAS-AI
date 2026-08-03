import { NextResponse } from 'next/server';
import { ScriptSchema } from '@/types';
import { createServerSupabase } from '@/lib/supabase/server';

/** Edita o roteiro de um vídeo — permitido apenas enquanto o lote está em revisão (job em draft). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const parsed = ScriptSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data: job } = await supabase.from('video_jobs').select('id,status').eq('id', id).single();
  if (!job) return NextResponse.json({ error: 'Vídeo não encontrado' }, { status: 404 });
  if (job.status !== 'draft') {
    return NextResponse.json(
      { error: 'O roteiro só pode ser editado antes de aprovar o lote.' },
      { status: 409 },
    );
  }

  const { error } = await supabase
    .from('video_jobs')
    .update({ script: parsed.data })
    .eq('id', id)
    .eq('status', 'draft');
  if (error) {
    console.error('jobs PATCH:', error.message);
    return NextResponse.json({ error: 'Não foi possível salvar o roteiro.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

const MAX_RETRIES = 3;

/** Exclui um vídeo individual. Webhook tardio de um job excluído é ignorado com segurança. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { data: job } = await supabase.from('video_jobs').select('batch_id').eq('id', id).maybeSingle();
  const { error } = await supabase.from('video_jobs').delete().eq('id', id);
  if (error) {
    console.error('jobs DELETE:', error.message);
    return NextResponse.json({ error: 'Não foi possível excluir o vídeo.' }, { status: 500 });
  }

  // Sem isto, apagar o último vídeo pendente deixaria o lote "Gerando" para sempre.
  if (job?.batch_id) {
    const { data: rest } = await supabase
      .from('video_jobs').select('status,retry_count').eq('batch_id', job.batch_id);
    const jobs = rest ?? [];
    const pending = jobs.some((j) => j.status !== 'completed' && j.status !== 'failed');
    const retryable = jobs.some((j) => j.status === 'failed' && j.retry_count < MAX_RETRIES);
    if (!pending && !retryable) {
      await supabase.from('video_batches')
        .update({ status: 'done' }).eq('id', job.batch_id).eq('status', 'approved');
    }
  }
  return NextResponse.json({ ok: true });
}
