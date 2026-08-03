import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { ProductUpdateSchema } from './schema';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const parsed = ProductUpdateSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const b = parsed.data;

  const { data, error } = await supabase
    .from('products')
    .update({ title: b.title, description: b.description, price_brl: b.priceBrl, image_urls: b.imageUrls })
    .eq('id', id)
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/**
 * Exclui o produto e tudo que depende dele: vídeos e lotes que o usam;
 * modelos vinculados apenas perdem o vínculo (product_id vira null).
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  // O desvínculo vem primeiro e ABORTA em erro: sem isso, uma falha aqui
  // deixaria o delete final quebrar por FK com lotes/vídeos já destruídos.
  const { error: unlinkErr } = await supabase
    .from('models').update({ product_id: null }).eq('product_id', id);
  if (unlinkErr) {
    console.error('products DELETE unlink:', unlinkErr.message);
    return NextResponse.json({ error: 'Não foi possível excluir o produto. Tente novamente.' }, { status: 500 });
  }
  const { data: batches } = await supabase.from('video_batches').select('id').eq('product_id', id);
  const batchIds = (batches ?? []).map((b) => b.id);
  if (batchIds.length > 0) {
    const { error: jobsErr } = await supabase.from('video_jobs').delete().in('batch_id', batchIds);
    if (jobsErr) {
      console.error('products DELETE jobs:', jobsErr.message);
      return NextResponse.json({ error: 'Não foi possível excluir os vídeos do produto.' }, { status: 500 });
    }
    const { error: batchErr } = await supabase.from('video_batches').delete().in('id', batchIds);
    if (batchErr) {
      console.error('products DELETE batches:', batchErr.message);
      return NextResponse.json({ error: 'Não foi possível excluir os lotes do produto.' }, { status: 500 });
    }
  }
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) {
    console.error('products DELETE:', error.message);
    return NextResponse.json({ error: 'Não foi possível excluir o produto.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
