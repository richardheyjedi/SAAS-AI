import { NextResponse } from 'next/server';
import { kickQueue } from '@/lib/kick';
import { createServerSupabase } from '@/lib/supabase/server';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { error } = await supabase.from('video_jobs').update({ status: 'queued' }).eq('batch_id', id).eq('status', 'draft');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await supabase.from('video_batches').update({ status: 'approved' }).eq('id', id);
  // A composição começa em segundos, sem esperar o próximo ciclo do cron.
  kickQueue();
  return NextResponse.json({ ok: true });
}
