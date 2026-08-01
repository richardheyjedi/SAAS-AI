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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
