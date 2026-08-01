import { NextResponse } from 'next/server';
import { generatePersona } from '@/lib/claude';
import { generateImage, muApiConfigFromEnv } from '@/lib/muapi';
import { createServerSupabase } from '@/lib/supabase/server';
import { ModelGenerateBodySchema } from './schema';

// Persona via Claude + submissões de referência à MuAPI numa request só.
export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const parsed = ModelGenerateBodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { region, customPrompt, refCount, imageEngine, referenceUrls, productId } = parsed.data;

  // Produto vinculado: a persona nasce alinhada a ele (nicho, estilo de venda).
  let productContext: string | undefined;
  if (productId) {
    const { data: product } = await supabase
      .from('products').select('title,description').eq('id', productId).single();
    if (!product) return NextResponse.json({ error: 'Produto vinculado não encontrado' }, { status: 404 });
    productContext = `${product.title}${product.description ? ` — ${product.description}` : ''}`;
  }

  // Falhas do Claude/MuAPI viram JSON legível no formulário, não um 500 opaco.
  let persona;
  try {
    persona = await generatePersona({ region, customPrompt, productContext });
  } catch (err) {
    return NextResponse.json(
      { error: `Falha ao gerar a persona: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
  const { data: model, error } = await supabase
    .from('models')
    .insert({
      name: persona.name,
      region,
      persona,
      status: refCount > 0 ? 'generating_refs' : 'pending_approval',
      image_engine: imageEngine,
      reference_image_urls: referenceUrls,
      product_id: productId ?? null,
    })
    .select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const cfg = muApiConfigFromEnv();
  try {
    for (let i = 0; i < refCount; i++) {
      const { requestId } = await generateImage(cfg, {
        engineId: imageEngine,
        prompt: `${persona.image_prompt} — reference shot ${i + 1}, same person, slightly different pose`,
      });
      await supabase.from('image_jobs').insert({ model_id: model.id, muapi_request_id: requestId });
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Falha ao gerar referências na MuAPI: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
  return NextResponse.json({ modelId: model.id }, { status: 201 });
}
