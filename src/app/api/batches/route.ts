import { NextResponse } from 'next/server';
import { PersonaSchema } from '@/types';
import { generateScripts } from '@/lib/claude';
import { batchCostUsd } from '@/lib/cost';
import { videoEngine as videoEngineOf } from '@/lib/engines';
import { getBalanceUsd, muApiConfigFromEnv } from '@/lib/muapi';
import { createServerSupabase } from '@/lib/supabase/server';
import { BatchBodySchema } from './schema';

// Gerar até 40 roteiros com o Claude passa fácil do timeout default da Vercel.
export const maxDuration = 300;

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const parsed = BatchBodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { modelId, productId, videoCount, durationSeconds, imageEngine, videoEngine, generateAudio, highBitrate, aspectRatio, resolution } = parsed.data;

  const [{ data: model }, { data: product }] = await Promise.all([
    supabase.from('models').select('persona,status').eq('id', modelId).single(),
    supabase.from('products').select('title,description').eq('id', productId).single(),
  ]);
  if (!model || !product) return NextResponse.json({ error: 'Modelo ou produto não encontrado' }, { status: 404 });
  if (model.status !== 'approved') return NextResponse.json({ error: 'Modelo ainda não aprovado' }, { status: 409 });

  // Bloqueio preventivo: recusa o lote se o saldo MuAPI não cobre a estimativa.
  // Falha na consulta de saldo não bloqueia (o cron tolera 402 sem perder nada).
  try {
    const balance = await getBalanceUsd(muApiConfigFromEnv());
    const projected = batchCostUsd(imageEngine, videoEngine, videoCount, durationSeconds);
    if (balance < projected) {
      return NextResponse.json(
        {
          error: `Saldo insuficiente na MuAPI: US$ ${balance.toFixed(2)} disponíveis, lote estimado em US$ ${projected.toFixed(2)}. Recarregue em muapi.ai/topup e tente de novo.`,
        },
        { status: 402 },
      );
    }
  } catch { /* consulta de saldo indisponível: segue — o cron é resiliente a 402 */ }

  const persona = PersonaSchema.parse(model.persona);
  // Falha do Claude vira JSON legível no formulário, não um 500 opaco.
  // Fala só entra no roteiro quando o tier de vídeo realmente gera áudio.
  const withSpeech = generateAudio && videoEngineOf(videoEngine).supportsAudio;
  let scripts;
  try {
    scripts = await generateScripts({
      persona, productTitle: product.title, productDescription: product.description,
      count: videoCount, durationSeconds, withSpeech,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Falha ao gerar os roteiros: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  // A quantidade real de roteiros devolvidos pelo Claude é a fonte de verdade:
  // se vier diferente do pedido, o lote é gravado com o que existe de fato.
  const actualCount = scripts.length;
  const estimated = batchCostUsd(imageEngine, videoEngine, actualCount, durationSeconds);
  const { data: batch, error } = await supabase
    .from('video_batches')
    .insert({
      model_id: modelId, product_id: productId, video_count: actualCount,
      duration_seconds: durationSeconds, estimated_cost_usd: estimated,
      image_engine: imageEngine, video_engine: videoEngine,
      generate_audio: generateAudio, high_bitrate: highBitrate,
      aspect_ratio: aspectRatio, resolution,
    })
    .select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = scripts.map((script) => ({ batch_id: batch.id, script, status: 'draft' }));
  const { error: jobsError } = await supabase.from('video_jobs').insert(rows);
  if (jobsError) return NextResponse.json({ error: jobsError.message }, { status: 500 });

  return NextResponse.json({ batchId: batch.id, videoCount: actualCount, estimatedCostUsd: estimated }, { status: 201 });
}
