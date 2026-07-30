import { NextResponse } from 'next/server';
import { PersonaSchema, ScriptSchema } from '@/types';
import { videoCostUsd } from '@/lib/cost';
import { generateImage, generateVideo, muApiConfigFromEnv } from '@/lib/muapi';
import { dispatchAllowance, nextAction, queueLimitsFromEnv } from '@/lib/queue';
import { createServiceSupabase } from '@/lib/supabase/server';

/** Tempo máximo que um job pode ficar esperando o webhook da MuAPI antes de ser dado como falho. */
const WEBHOOK_TIMEOUT_MS = 2 * 60 * 60 * 1000;
/** Mínimo de despachos no dia para o circuit breaker de taxa de falha valer. */
const BREAKER_MIN_SAMPLE = 10;
/** Fração de falhas do dia acima da qual o cron para de despachar. */
const BREAKER_FAILURE_RATE = 0.3;
/** Espelha o MAX_RETRIES de src/lib/queue.ts: falha com retry_count menor ainda volta para a fila. */
const MAX_RETRIES = 3;

type ServiceSupabase = ReturnType<typeof createServiceSupabase>;

/**
 * Fecha lotes cuja última transição terminal aconteceu no lado do cron
 * (falha no catch do loop ou reconciliação de timeout) e portanto nunca
 * passou pelo maybeFinishBatch do webhook.
 */
async function sweepFinishedBatches(supabase: ServiceSupabase) {
  const { data: batches } = await supabase
    .from('video_batches').select('id').eq('status', 'approved');
  for (const batch of batches ?? []) {
    const { data: jobs } = await supabase
      .from('video_jobs').select('status,retry_count').eq('batch_id', batch.id);
    if (!jobs || jobs.length === 0) continue;
    const pending = jobs.some((j) => j.status !== 'completed' && j.status !== 'failed');
    if (pending) continue;
    const retryable = jobs.some((j) => j.status === 'failed' && j.retry_count < MAX_RETRIES);
    if (retryable) continue;
    await supabase.from('video_batches').update({ status: 'done' }).eq('id', batch.id);
  }
}

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  const supabase = createServiceSupabase();
  const cfg = muApiConfigFromEnv();
  const limits = queueLimitsFromEnv();

  // Reconciliação: jobs despachados que nunca receberam webhook viram 'failed'
  // (e assim voltam a ser elegíveis para retry no próprio ciclo da fila).
  const stuckCutoff = new Date(Date.now() - WEBHOOK_TIMEOUT_MS).toISOString();
  await supabase
    .from('video_jobs')
    .update({ status: 'failed', error: 'Timeout aguardando webhook da MuAPI' })
    .in('status', ['composing', 'generating'])
    .lt('dispatched_at', stuckCutoff);

  // Estado do dia medido pela data de DESPACHO (não de criação): é o despacho
  // que consome orçamento, e um lote criado ontem pode ser processado hoje.
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const { data: todayJobs } = await supabase
    .from('video_jobs')
    .select('cost_usd,status')
    .gte('dispatched_at', todayStart.toISOString());
  const dispatchedToday = todayJobs?.length ?? 0;
  const state = {
    videosToday: dispatchedToday,
    costTodayUsd: (todayJobs ?? []).reduce((s, j) => s + Number(j.cost_usd), 0),
  };

  // Circuit breaker: com muita falha no dia, para de queimar crédito na MuAPI.
  const failedToday = (todayJobs ?? []).filter((j) => j.status === 'failed').length;
  const paused = dispatchedToday >= BREAKER_MIN_SAMPLE
    && failedToday / dispatchedToday > BREAKER_FAILURE_RATE;

  const { data: candidates } = await supabase
    .from('video_jobs')
    .select('id,status,retry_count,composed_image_url,script,batch_id,video_batches(duration_seconds,model_id,product_id,models(persona,reference_image_urls),products(image_urls,title))')
    .in('status', ['queued', 'ready', 'failed'])
    .order('created_at', { ascending: true })
    .limit(50);

  let dispatched = 0;
  for (const job of candidates ?? []) {
    // Um job problemático nunca pode derrubar o ciclo inteiro da fila.
    try {
      const action = nextAction(job);
      if (action.kind === 'none') continue;
      if (action.kind === 'retry') {
        await supabase.from('video_jobs')
          .update({ status: action.to, retry_count: job.retry_count + 1, error: null, muapi_request_id: null })
          .eq('id', job.id);
        continue;
      }
      if (paused) continue;

      const batch = job.video_batches as unknown as {
        duration_seconds: number;
        models: { persona: unknown; reference_image_urls: string[] };
        products: { image_urls: string[]; title: string };
      };
      const perVideo = videoCostUsd(batch.duration_seconds);
      if (dispatchAllowance(state, limits, perVideo) <= 0) break;

      const script = ScriptSchema.parse(job.script);
      const now = new Date().toISOString();
      if (action.kind === 'compose') {
        const persona = PersonaSchema.parse(batch.models.persona);
        const refs = [batch.models.reference_image_urls[0], batch.products.image_urls[0]].filter(Boolean) as string[];
        const { requestId } = await generateImage(cfg, {
          prompt: `${persona.image_prompt}. ${script.scene_description}. The person must look identical to the reference photos.`,
          imageUrls: refs,
        });
        await supabase.from('video_jobs')
          .update({ status: 'composing', muapi_request_id: requestId, dispatched_at: now })
          .eq('id', job.id);
      } else {
        const { requestId } = await generateVideo(cfg, {
          imageUrl: job.composed_image_url!,
          prompt: script.motion_prompt,
          durationSeconds: batch.duration_seconds,
        });
        await supabase.from('video_jobs')
          .update({ status: 'generating', muapi_request_id: requestId, cost_usd: perVideo, dispatched_at: now })
          .eq('id', job.id);
        state.videosToday += 1;
        state.costTodayUsd += perVideo;
      }
      dispatched += 1;
    } catch (err) {
      await supabase.from('video_jobs')
        .update({ status: 'failed', error: String(err).slice(0, 500) })
        .eq('id', job.id);
      continue;
    }
  }

  // Nunca pode derrubar a rota: o sweep é limpeza, não parte do despacho.
  try { await sweepFinishedBatches(supabase); } catch { /* ignora */ }

  if (paused) {
    return NextResponse.json({ dispatched: 0, paused: true, reason: 'Taxa de falha acima de 30% hoje' });
  }
  return NextResponse.json({ dispatched });
}
