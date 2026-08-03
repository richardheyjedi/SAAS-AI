import { NextResponse } from 'next/server';
import { kickQueue } from '@/lib/kick';
import { createServerSupabase } from '@/lib/supabase/server';

// O kick (waitUntil) só vive até o maxDuration DESTA rota.
export const maxDuration = 300;

/**
 * Religa a fila sob demanda (ex.: depois de recarregar créditos). O cron
 * agendado continua como rede de segurança; esta rota elimina a espera.
 */
export async function POST() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  kickQueue();
  return NextResponse.json({ ok: true });
}
