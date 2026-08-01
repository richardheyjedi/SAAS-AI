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
