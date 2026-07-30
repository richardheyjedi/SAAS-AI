import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';

const BodySchema = z.object({
  title: z.string().min(2),
  description: z.string().default(''),
  priceBrl: z.number().positive().optional(),
  imageUrls: z.array(z.string().url()).default([]),
});

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const b = parsed.data;
  const { data, error } = await supabase
    .from('products')
    .insert({ title: b.title, description: b.description, price_brl: b.priceBrl, image_urls: b.imageUrls })
    .select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ productId: data.id }, { status: 201 });
}
