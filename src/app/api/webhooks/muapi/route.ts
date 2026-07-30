import { NextResponse } from 'next/server';
import { parseWebhook } from '@/lib/muapi';
import { createServiceSupabase } from '@/lib/supabase/server';

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
      const { count } = await supabase.from('image_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('model_id', imageJob.model_id).eq('status', 'generating');
      await supabase.from('models').update({
        reference_image_urls: urls,
        ...(count === 0 ? { status: 'pending_approval' } : {}),
      }).eq('id', imageJob.model_id);
    }
    return NextResponse.json({ ok: true });
  }

  const { data: videoJob } = await supabase
    .from('video_jobs').select('id,status').eq('muapi_request_id', event.requestId).maybeSingle();
  if (!videoJob) return NextResponse.json({ ok: true });
  if (videoJob.status === 'completed' || videoJob.status === 'failed') {
    return NextResponse.json({ ok: true });
  }

  if (event.status === 'failed') {
    await supabase.from('video_jobs').update({ status: 'failed', error: event.error ?? 'Falha na MuAPI' }).eq('id', videoJob.id);
  } else if (videoJob.status === 'composing') {
    await supabase.from('video_jobs').update({
      status: 'ready', composed_image_url: event.outputUrl ?? null, muapi_request_id: null,
    }).eq('id', videoJob.id);
  } else {
    await supabase.from('video_jobs').update({
      status: 'completed', video_url: event.outputUrl ?? null, completed_at: new Date().toISOString(),
    }).eq('id', videoJob.id);
  }
  return NextResponse.json({ ok: true });
}
