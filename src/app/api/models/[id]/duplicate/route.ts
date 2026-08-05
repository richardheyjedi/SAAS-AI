import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { DuplicateBodySchema } from './schema';

/**
 * Duplica uma modelo aprovada trocando o produto: mesma persona e mesmas
 * referências (URLs compartilhadas — remoção de ref nunca apaga do bucket),
 * custo zero. A cópia nasce 'approved'; image_jobs não são copiados.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const parsed = DuplicateBodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { productId, name } = parsed.data;

  const { data: original } = await supabase
    .from('models')
    .select('name,region,persona,reference_image_urls,image_engine,status')
    .eq('id', id)
    .single();
  if (!original) return NextResponse.json({ error: 'Modelo não encontrado' }, { status: 404 });
  if (original.status !== 'approved') {
    return NextResponse.json({ error: 'Só modelos aprovadas podem ser duplicadas.' }, { status: 409 });
  }

  const { data: product } = await supabase.from('products').select('id').eq('id', productId).single();
  if (!product) {
    return NextResponse.json({ error: 'Produto não encontrado — atualize a página.' }, { status: 404 });
  }

  const { data: copy, error } = await supabase
    .from('models')
    .insert({
      name: name ?? `${original.name} (2)`,
      region: original.region,
      persona: original.persona,
      reference_image_urls: original.reference_image_urls ?? [],
      image_engine: original.image_engine,
      status: 'approved',
      product_id: productId,
    })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ modelId: copy.id }, { status: 201 });
}
