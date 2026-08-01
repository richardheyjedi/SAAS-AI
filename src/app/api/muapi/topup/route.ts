import { NextResponse } from 'next/server';
import { z } from 'zod';
import { muApiConfigFromEnv } from '@/lib/muapi';
import { createServerSupabase } from '@/lib/supabase/server';

const BodySchema = z.object({ amount: z.number().int().min(5).max(200) });

/** Gera um link de checkout do Stripe para recarregar créditos na MuAPI. */
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const cfg = muApiConfigFromEnv();
  const res = await fetch(`${cfg.baseUrl}/api/v1/account/topup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey },
    body: JSON.stringify({ amount: parsed.data.amount }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    return NextResponse.json({ error: `MuAPI topup ${res.status}: ${await res.text()}` }, { status: 502 });
  }
  const data = (await res.json()) as { checkout_url?: string };
  if (!data.checkout_url) return NextResponse.json({ error: 'MuAPI não retornou o link de pagamento' }, { status: 502 });
  return NextResponse.json({ checkoutUrl: data.checkout_url });
}
