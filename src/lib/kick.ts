import { waitUntil } from '@vercel/functions';

/**
 * Impulsiona a fila sem esperar o cron: dispara o process-queue em background
 * logo após eventos que criam trabalho novo (lote aprovado, imagem composta).
 * Fire-and-forget — nunca lança e não atrasa a resposta de quem chamou;
 * o cron agendado permanece como rede de segurança.
 */
export function kickQueue() {
  const base = process.env.APP_BASE_URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) return;
  try {
    waitUntil(
      fetch(`${base}/api/cron/process-queue`, {
        headers: { authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(290_000),
      }).catch(() => { /* melhor esforço: o cron agendado cobre falhas */ }),
    );
  } catch { /* fora da Vercel (dev/local) waitUntil pode não existir: ignora */ }
}
