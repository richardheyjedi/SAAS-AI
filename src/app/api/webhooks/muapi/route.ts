import { NextResponse } from 'next/server';
import { parseWebhook } from '@/lib/muapi';
import { createServiceSupabase } from '@/lib/supabase/server';

type ServiceSupabase = ReturnType<typeof createServiceSupabase>;

const MAX_RETRIES = 3;

/**
 * Fecha o lote quando não sobra nenhum job em andamento e nenhuma falha ainda
 * elegível a retry pelo cron. Chamado depois de todo update terminal.
 */
async function maybeFinishBatch(supabase: ServiceSupabase, batchId: string | null) {
  if (!batchId) return;
  const { data: jobs } = await supabase
    .from('video_jobs').select('status,retry_count').eq('batch_id', batchId);
  if (!jobs) return;
  const pending = jobs.filter((j) => j.status !== 'completed' && j.status !== 'failed');
  if (pending.length > 0) return;
  const retryable = jobs.some((j) => j.status === 'failed' && j.retry_count < MAX_RETRIES);
  if (retryable) return;
  await supabase.from('video_batches').update({ status: 'done' }).eq('id', batchId);
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get('secret') !== process.env.MUAPI_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  let event;
  try { event = parseWebhook(await req.json()); }
  catch { return NextResponse.json({ error: 'Payload inválido' }, { status: 400 }); }

  const supabase = createServiceSupabase();

  const { data: imageJob } = await supabase
    .from('image_jobs').select('id,model_id,status').eq('muapi_request_id', event.requestId).maybeSingle();
  if (imageJob) {
    if (imageJob.status === 'completed' || imageJob.status === 'failed') {
      return NextResponse.json({ ok: true });
    }
    await supabase.from('image_jobs').update({
      status: event.status, image_url: event.outputUrl ?? null, error: event.error ?? null,
    }).eq('id', imageJob.id);
    if (event.status === 'completed' && event.outputUrl) {
      const { data: model } = await supabase.from('models')
        .select('reference_image_urls').eq('id', imageJob.model_id).single();
      const urls = [...(model?.reference_image_urls ?? []), event.outputUrl];
      await supabase.from('models')
        .update({ reference_image_urls: urls }).eq('id', imageJob.model_id);
    }
    // Acabaram as referências em geração: o modelo vai para aprovação com o
    // que tiver (mesmo que alguma ref tenha falhado) — quem decide é o usuário.
    const { count } = await supabase.from('image_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('model_id', imageJob.model_id).eq('status', 'generating');
    if (count === 0) {
      await supabase.from('models')
        .update({ status: 'pending_approval' })
        .eq('id', imageJob.model_id).eq('status', 'generating_refs');
    }
    return NextResponse.json({ ok: true });
  }

  const { data: videoJob } = await supabase
    .from('video_jobs').select('id,status,batch_id,retry_count').eq('muapi_request_id', event.requestId).maybeSingle();
  if (!videoJob) return NextResponse.json({ ok: true });
  if (videoJob.status === 'completed' || videoJob.status === 'failed') {
    return NextResponse.json({ ok: true });
  }

  if (event.status === 'failed') {
    await supabase.from('video_jobs').update({ status: 'failed', error: event.error ?? 'Falha na MuAPI' }).eq('id', videoJob.id);
    await maybeFinishBatch(supabase, videoJob.batch_id);
  } else if (videoJob.status === 'composing') {
    if (!event.outputUrl) {
      // 'completed' sem output deixaria o job em 'ready' sem imagem para animar.
      await supabase.from('video_jobs').update({
        status: 'failed', error: 'MuAPI retornou sem output', muapi_request_id: null,
      }).eq('id', videoJob.id);
      await maybeFinishBatch(supabase, videoJob.batch_id);
    } else {
      await supabase.from('video_jobs').update({
        status: 'ready', composed_image_url: event.outputUrl, muapi_request_id: null,
      }).eq('id', videoJob.id);
    }
  } else {
    await supabase.from('video_jobs').update({
      status: 'completed', video_url: event.outputUrl ?? null, completed_at: new Date().toISOString(),
    }).eq('id', videoJob.id);
    await maybeFinishBatch(supabase, videoJob.batch_id);
  }
  return NextResponse.json({ ok: true });
}
