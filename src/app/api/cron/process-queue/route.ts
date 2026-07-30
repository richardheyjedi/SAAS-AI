import { NextResponse } from 'next/server';
import { PersonaSchema, ScriptSchema } from '@/types';
import { videoCostUsd } from '@/lib/cost';
import { generateImage, generateVideo, muApiConfigFromEnv } from '@/lib/muapi';
import { dispatchAllowance, nextAction, queueLimitsFromEnv } from '@/lib/queue';
import { createServiceSupabase } from '@/lib/supabase/server';

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  const supabase = createServiceSupabase();
  const cfg = muApiConfigFromEnv();
  const limits = queueLimitsFromEnv();

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const { data: todayJobs } = await supabase
    .from('video_jobs')
    .select('cost_usd,status')
    .gte('created_at', todayStart.toISOString())
    .in('status', ['composing', 'ready', 'generating', 'completed']);
  const state = {
    videosToday: todayJobs?.length ?? 0,
    costTodayUsd: (todayJobs ?? []).reduce((s, j) => s + Number(j.cost_usd), 0),
  };

  const { data: candidates } = await supabase
    .from('video_jobs')
    .select('id,status,retry_count,composed_image_url,script,batch_id,video_batches(duration_seconds,model_id,product_id,models(persona,reference_image_urls),products(image_urls,title))')
    .in('status', ['queued', 'ready', 'failed'])
    .order('created_at', { ascending: true })
    .limit(50);

  let dispatched = 0;
  for (const job of candidates ?? []) {
    const batch = job.video_batches as unknown as {
      duration_seconds: number;
      models: { persona: unknown; reference_image_urls: string[] };
      products: { image_urls: string[]; title: string };
    };
    const perVideo = videoCostUsd(batch.duration_seconds);
    if (dispatchAllowance(state, limits, perVideo) <= 0) break;

    const action = nextAction(job);
    if (action.kind === 'none') continue;
    if (action.kind === 'retry') {
      await supabase.from('video_jobs')
        .update({ status: action.to, retry_count: job.retry_count + 1, error: null })
        .eq('id', job.id);
      continue;
    }

    const script = ScriptSchema.parse(job.script);
    if (action.kind === 'compose') {
      const persona = PersonaSchema.parse(batch.models.persona);
      const refs = [batch.models.reference_image_urls[0], batch.products.image_urls[0]].filter(Boolean) as string[];
      const { requestId } = await generateImage(cfg, {
        prompt: `${persona.image_prompt}. ${script.scene_description}. The person must look identical to the reference photos.`,
        imageUrls: refs,
      });
      await supabase.from('video_jobs')
        .update({ status: 'composing', muapi_request_id: requestId })
        .eq('id', job.id);
    } else {
      const { requestId } = await generateVideo(cfg, {
        imageUrl: job.composed_image_url!,
        prompt: script.motion_prompt,
        durationSeconds: batch.duration_seconds,
      });
      await supabase.from('video_jobs')
        .update({ status: 'generating', muapi_request_id: requestId, cost_usd: perVideo })
        .eq('id', job.id);
      state.videosToday += 1;
      state.costTodayUsd += perVideo;
    }
    dispatched += 1;
  }
  return NextResponse.json({ dispatched });
}
