// Métricas de tempo da tela de Vídeos.
// IMPORTANTE: dispatched_at é sobrescrito a cada estágio no cron; para um job
// concluído ele marca o início da ANIMAÇÃO — as métricas são rotuladas assim
// de propósito (o tempo de composição não está incluído).

export function formatDuration(ms: number): string {
  const s = Math.round(Math.max(0, ms) / 1000);
  if (s < 60) return `${s}s`;
  const min = Math.floor(s / 60);
  const rest = s % 60;
  if (min < 60) return rest > 0 ? `${min}min ${rest}s` : `${min}min`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}min`;
}

export interface TimeableJob {
  status: string;
  dispatched_at: string | null;
  completed_at: string | null;
}

/**
 * Média de animação por vídeo (claim da animação → entrega) e janela de
 * entrega do grupo (1ª animação → última entrega), sobre os vídeos prontos.
 */
export function groupTimings(jobs: TimeableJob[]): { avgMs: number; totalMs: number; sample: number } | null {
  const done = jobs.filter((j) => j.status === 'completed' && j.dispatched_at && j.completed_at);
  if (done.length === 0) return null;
  const durations = done.map((j) => Math.max(0, new Date(j.completed_at!).getTime() - new Date(j.dispatched_at!).getTime()));
  const avgMs = durations.reduce((a, b) => a + b, 0) / durations.length;
  const firstDispatch = Math.min(...done.map((j) => new Date(j.dispatched_at!).getTime()));
  const lastDone = Math.max(...done.map((j) => new Date(j.completed_at!).getTime()));
  return { avgMs, totalMs: Math.max(0, lastDone - firstDispatch), sample: done.length };
}
