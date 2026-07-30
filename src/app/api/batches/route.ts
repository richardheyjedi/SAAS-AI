import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PersonaSchema } from '@/types';
import { generateScripts } from '@/lib/claude';
import { batchCostUsd } from '@/lib/cost';
import { createServerSupabase } from '@/lib/supabase/server';

const BodySchema = z.object({
  modelId: z.string().uuid(),
  productId: z.string().uuid(),
  videoCount: z.number().int().min(1).max(40),
  durationSeconds: z.union([z.literal(5), z.literal(10)]),
});

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { modelId, productId, videoCount, durationSeconds } = parsed.data;

  const [{ data: model }, { data: product }] = await Promise.all([
    supabase.from('models').select('persona,status').eq('id', modelId).single(),
    supabase.from('products').select('title,description').eq('id', productId).single(),
  ]);
  if (!model || !product) return NextResponse.json({ error: 'Modelo ou produto não encontrado' }, { status: 404 });
  if (model.status !== 'approved') return NextResponse.json({ error: 'Modelo ainda não aprovado' }, { status: 409 });

  const persona = PersonaSchema.parse(model.persona);
  const scripts = await generateScripts({
    persona, productTitle: product.title, productDescription: product.description,
    count: videoCount, durationSeconds,
  });

  // A quantidade real de roteiros devolvidos pelo Claude é a fonte de verdade:
  // se vier diferente do pedido, o lote é gravado com o que existe de fato.
  const actualCount = scripts.length;
  const estimated = batchCostUsd(actualCount, durationSeconds);
  const { data: batch, error } = await supabase
    .from('video_batches')
    .insert({ model_id: modelId, product_id: productId, video_count: actualCount, duration_seconds: durationSeconds, estimated_cost_usd: estimated })
    .select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = scripts.map((script) => ({ batch_id: batch.id, script, status: 'draft' }));
  const { error: jobsError } = await supabase.from('video_jobs').insert(rows);
  if (jobsError) return NextResponse.json({ error: jobsError.message }, { status: 500 });

  return NextResponse.json({ batchId: batch.id, videoCount: actualCount, estimatedCostUsd: estimated }, { status: 201 });
}
