import { NextResponse } from 'next/server';
import { PersonaSchema, ScriptSchema } from '@/types';
import { imageCostUsd, videoCostUsd } from '@/lib/cost';
import { videoEngine as videoEngineOf } from '@/lib/engines';
import { generateImage, generateVideo, isInsufficientCredit, muApiConfigFromEnv } from '@/lib/muapi';
import { dispatchAllowance, nextAction, queueLimitsFromEnv } from '@/lib/queue';
import { withSpokenLine } from '@/prompts/video-scripts';
import { createServiceSupabase } from '@/lib/supabase/server';

// Até 50 despachos sequenciais com chamadas externas por ciclo.
export const maxDuration = 300;

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
 * Modelos presos em 'generating_refs' sem nenhuma referência ainda em geração
 * (webhooks perdidos já viraram 'failed' na reconciliação) são promovidos para
 * aprovação com as refs que tiverem — mesma filosofia do webhook. Só considera
 * modelos mais antigos que o cutoff para não competir com o fluxo normal.
 */
async function sweepStuckModels(supabase: ServiceSupabase, stuckCutoff: string) {
  const { data: models } = await supabase
    .from('models').select('id')
    .eq('status', 'generating_refs')
    .lt('created_at', stuckCutoff);
  for (const model of models ?? []) {
    const { count } = await supabase.from('image_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('model_id', model.id).eq('status', 'generating');
    if (count === 0) {
      await supabase.from('models')
        .update({ status: 'pending_approval' })
        .eq('id', model.id).eq('status', 'generating_refs');
    }
  }
}

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
    if (!jobs) continue;
    // Lote aprovado que ficou sem nenhum job (vídeos excluídos) também fecha.
    if (jobs.length === 0) {
      await supabase.from('video_batches').update({ status: 'done' }).eq('id', batch.id);
      continue;
    }
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

  // Referências de modelo também perdem webhook: sem esta reconciliação o
  // modelo ficaria preso em 'generating_refs' para sempre.
  await supabase
    .from('image_jobs')
    .update({ status: 'failed', error: 'Timeout aguardando webhook da MuAPI' })
    .eq('status', 'generating')
    .lt('created_at', stuckCutoff);

  // Estado do dia medido pela data de DESPACHO (não de criação): é o despacho
  // que consome orçamento, e um lote criado ontem pode ser processado hoje.
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();
  const { data: todayJobs } = await supabase
    .from('video_jobs')
    .select('status')
    .gte('dispatched_at', todayIso);
  const dispatchedToday = todayJobs?.length ?? 0;

  // Circuit breaker: com muita falha no dia, para de queimar crédito na MuAPI.
  const failedToday = (todayJobs ?? []).filter((j) => j.status === 'failed').length;
  const paused = dispatchedToday >= BREAKER_MIN_SAMPLE
    && failedToday / dispatchedToday > BREAKER_FAILURE_RATE;

  /**
   * Teto diário contado no BANCO e apenas sobre ANIMAÇÕES (jobs que chegaram
   * à fase de vídeo têm composed_image_url ao serem reivindicados). Recontar a
   * cada claim mantém o limite válido mesmo com N invocações concorrentes
   * disparadas pelos kicks — o snapshot em memória não segura o agregado.
   * Composições não consomem o teto: um lote de 40 compõe e anima no mesmo dia.
   */
  async function animationsToday(): Promise<number> {
    const { count } = await supabase
      .from('video_jobs')
      .select('id', { count: 'exact', head: true })
      .gte('dispatched_at', todayIso)
      .not('composed_image_url', 'is', null);
    return count ?? 0;
  }

  const { data: candidates, error: candidatesError } = await supabase
    .from('video_jobs')
    .select('id,status,retry_count,composed_image_url,script,batch_id,video_batches(duration_seconds,image_engine,video_engine,generate_audio,high_bitrate,aspect_ratio,resolution,model_id,product_id,models(persona,reference_image_urls),products(image_urls,title))')
    .in('status', ['queued', 'ready', 'failed'])
    .order('created_at', { ascending: true })
    .limit(50);
  // Falha do select (ex.: migração 0002 não aplicada) precisa ser visível,
  // não um ciclo "saudável" que despacha zero para sempre.
  if (candidatesError) {
    return NextResponse.json({ error: candidatesError.message }, { status: 500 });
  }

  let dispatched = 0;
  let stalledByCredit = false;
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
        image_engine: string;
        video_engine: string;
        generate_audio: boolean;
        high_bitrate: boolean;
        aspect_ratio: string;
        resolution: string;
        models: { persona: unknown; reference_image_urls: string[] };
        products: { image_urls: string[]; title: string };
      };
      const perVideo = videoCostUsd(batch.video_engine, batch.duration_seconds)
        + imageCostUsd(batch.image_engine);
      // O teto vale para ANIMAÇÕES e é recontado do banco a cada claim
      // (seguro sob invocações concorrentes). Composição não consome teto.
      if (action.kind === 'animate'
        && dispatchAllowance({ videosToday: await animationsToday() }, limits) <= 0) break;

      const script = ScriptSchema.parse(job.script);
      const now = new Date().toISOString();
      // Claim atômico ANTES de chamar a MuAPI: se outro ciclo já pegou o job
      // (ou a função anterior morreu depois do submit), não submetemos de novo.
      // Função morta ENTRE claim e submit deixa o job sem request_id e a
      // reconciliação de timeout acima o devolve à fila.
      if (action.kind === 'compose') {
        const { data: claimed } = await supabase.from('video_jobs')
          .update({ status: 'composing', dispatched_at: now })
          .eq('id', job.id).eq('status', 'queued')
          .select('id');
        if (!claimed?.length) continue;
        const persona = PersonaSchema.parse(batch.models.persona);
        const refs = [batch.models.reference_image_urls[0], batch.products.image_urls[0]].filter(Boolean) as string[];
        const { requestId } = await generateImage(cfg, {
          engineId: batch.image_engine,
          prompt: `${persona.image_prompt}. ${script.scene_description}. The person must look identical to the reference photos.`,
          imageUrls: refs,
          aspectRatio: batch.aspect_ratio,
        });
        await supabase.from('video_jobs')
          .update({ muapi_request_id: requestId })
          .eq('id', job.id);
      } else {
        const { data: claimed } = await supabase.from('video_jobs')
          .update({ status: 'generating', cost_usd: perVideo, dispatched_at: now })
          .eq('id', job.id).eq('status', 'ready')
          .select('id');
        if (!claimed?.length) continue;
        // Fala dedicada do roteiro vira voz: acoplada ao movimento só quando o
        // lote pediu som e o tier realmente gera áudio.
        let motionPrompt = script.motion_prompt;
        if (script.speech && batch.generate_audio && videoEngineOf(batch.video_engine).supportsAudio) {
          const personaRegion = PersonaSchema.safeParse(batch.models.persona);
          motionPrompt = withSpokenLine(
            script.motion_prompt,
            script.speech,
            personaRegion.success ? personaRegion.data.region : 'br',
          );
        }
        const { requestId } = await generateVideo(cfg, {
          engineId: batch.video_engine,
          imageUrl: job.composed_image_url!,
          prompt: motionPrompt,
          durationSeconds: batch.duration_seconds,
          aspectRatio: batch.aspect_ratio,
          resolution: batch.resolution,
          generateAudio: batch.generate_audio,
          highBitrate: batch.high_bitrate,
        });
        await supabase.from('video_jobs')
          .update({ muapi_request_id: requestId })
          .eq('id', job.id);
      }
      dispatched += 1;
    } catch (err) {
      // Sem crédito NÃO é falha do vídeo: devolve o job intacto à fila (sem
      // queimar retry, sem contaminar o circuit breaker) e encerra o ciclo —
      // nada mais passaria. Assim que houver saldo, tudo continua de onde parou.
      if (isInsufficientCredit(err)) {
        await supabase.from('video_jobs')
          .update({ status: job.status, dispatched_at: null })
          .eq('id', job.id);
        stalledByCredit = true;
        break;
      }
      await supabase.from('video_jobs')
        .update({ status: 'failed', error: String(err).slice(0, 500) })
        .eq('id', job.id);
      continue;
    }
  }

  // Nunca podem derrubar a rota: sweeps são limpeza, não parte do despacho.
  try { await sweepStuckModels(supabase, stuckCutoff); } catch { /* ignora */ }
  try { await sweepFinishedBatches(supabase); } catch { /* ignora */ }

  if (paused) {
    return NextResponse.json({ dispatched: 0, paused: true, reason: 'Taxa de falha acima de 30% hoje' });
  }
  // Stall por saldo é observável na resposta (e o botão de recarga religa a fila).
  if (stalledByCredit) {
    return NextResponse.json({ dispatched, stalled: 'insufficient_credit' });
  }
  return NextResponse.json({ dispatched });
}
