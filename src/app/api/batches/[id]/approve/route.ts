import { NextResponse } from 'next/server';
import { kickQueue } from '@/lib/kick';
import { getBalanceUsd, muApiConfigFromEnv } from '@/lib/muapi';
import { createServerSupabase } from '@/lib/supabase/server';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  // Bloqueio preventivo: aprovar é o que gasta — confere o saldo contra a estimativa.
  try {
    const { data: batch } = await supabase
      .from('video_batches').select('estimated_cost_usd').eq('id', id).single();
    if (batch) {
      const balance = await getBalanceUsd(muApiConfigFromEnv());
      if (balance < Number(batch.estimated_cost_usd)) {
        return NextResponse.json(
          {
            error: `Saldo insuficiente na MuAPI: US$ ${balance.toFixed(2)} disponíveis, lote estimado em US$ ${Number(batch.estimated_cost_usd).toFixed(2)}. Recarregue em muapi.ai/topup e aprove de novo.`,
          },
          { status: 402 },
        );
      }
    }
  } catch { /* saldo indisponível: segue — o cron tolera 402 sem perder nada */ }

  const { error } = await supabase.from('video_jobs').update({ status: 'queued' }).eq('batch_id', id).eq('status', 'draft');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await supabase.from('video_batches').update({ status: 'approved' }).eq('id', id);
  // A composição começa em segundos, sem esperar o próximo ciclo do cron.
  kickQueue();
  return NextResponse.json({ ok: true });
}
