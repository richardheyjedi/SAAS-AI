import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase/server';
import { getBalanceUsd, muApiConfigFromEnv } from '@/lib/muapi';
import { queueLimitsFromEnv } from '@/lib/queue';
import type { JobStatus } from '@/types';
import { TopUpButton } from './TopUpButton';

/** Abaixo disso o card de saldo entra em alerta — não cobre nem um lote pequeno. */
const LOW_BALANCE_USD = 2;

type BatchRow = {
  id: string;
  video_count: number;
  estimated_cost_usd: number;
  status: 'review' | 'approved' | 'done';
  created_at: string;
  models: { name: string } | { name: string }[] | null;
  products: { title: string } | { title: string }[] | null;
};

type VideoJobRow = {
  id: string;
  status: JobStatus;
  cost_usd: number | null;
  created_at: string;
};

const BATCH_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  review: { label: 'Em revisão', cls: 'p-warn' },
  approved: { label: 'Gerando', cls: 'p-cyan' },
  done: { label: 'Concluído', cls: 'p-ok' },
};

function one<T>(rel: T | T[] | null): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

function formatUsd(v: number): string {
  return 'US$ ' + v.toFixed(2).replace('.', ',');
}

function todayStartIso(): string {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

function weekAgoIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString();
}

export default async function DashboardPage() {
  const limits = queueLimitsFromEnv();
  let videoJobsToday: VideoJobRow[] = [];
  let videoJobsWeek: VideoJobRow[] = [];
  let queuedJobs: VideoJobRow[] = [];
  let recentBatches: BatchRow[] = [];
  let muapiBalance: number | null = null;
  try {
    muapiBalance = await getBalanceUsd(muApiConfigFromEnv());
  } catch {
    muapiBalance = null;
  }

  try {
    const supabase = await createServerSupabase();
    const since = todayStartIso();

    const [todayRes, weekRes, queueRes, batchesRes] = await Promise.all([
      supabase.from('video_jobs').select('id,status,cost_usd,created_at').gte('created_at', since),
      supabase.from('video_jobs').select('id,status,cost_usd,created_at').gte('created_at', weekAgoIso()),
      supabase.from('video_jobs').select('id,status,cost_usd,created_at').in('status', ['queued', 'ready', 'composing']),
      supabase
        .from('video_batches')
        .select('id,video_count,estimated_cost_usd,status,created_at,models(name),products(title)')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);
    videoJobsToday = todayRes.data ?? [];
    videoJobsWeek = weekRes.data ?? [];
    queuedJobs = queueRes.data ?? [];
    recentBatches = (batchesRes.data as unknown as BatchRow[]) ?? [];
  } catch {
    videoJobsToday = [];
    videoJobsWeek = [];
    queuedJobs = [];
    recentBatches = [];
  }

  const videosToday = videoJobsToday.filter((j) => j.status === 'generating' || j.status === 'completed').length;
  const naFila = queuedJobs.length ?? 0;
  const gastoHoje = videoJobsToday.reduce((sum, j) => sum + (j.cost_usd ?? 0), 0);
  const failedWeek = videoJobsWeek.filter((j) => j.status === 'failed').length;
  const failureRate = videoJobsWeek.length > 0 ? Math.round((failedWeek / videoJobsWeek.length) * 100) : 0;

  const today = new Date();
  const subtitle = today.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <section className="screen on">
      <div className="head">
        <div>
          <h1>Dashboard</h1>
          <div className="sub">{subtitle}</div>
        </div>
        <Link href="/batches/new" className="btn primary">
          + Novo lote
        </Link>
      </div>
      <div className="stats">
        <div className="card stat">
          <div className="k">Vídeos hoje</div>
          <div className="v">{videosToday}</div>
          <div className="d">de {limits.dailyVideoLimit} no teto diário</div>
        </div>
        <div className="card stat">
          <div className="k">Na fila</div>
          <div className="v">{naFila}</div>
          <div className="d">aguardando processamento</div>
        </div>
        <div className="card stat">
          <div className="k">Gasto hoje</div>
          <div className="v">{formatUsd(gastoHoje)}</div>
          <div className="d">estimado pela tabela de preços</div>
        </div>
        <div className="card stat">
          <div className="k">Saldo MuAPI</div>
          <div className="v" style={muapiBalance != null && muapiBalance < LOW_BALANCE_USD ? { color: 'var(--err)' } : undefined}>
            {muapiBalance != null ? formatUsd(muapiBalance) : '—'}
          </div>
          <div className="d">
            {muapiBalance == null
              ? 'não foi possível consultar'
              : muapiBalance < LOW_BALANCE_USD
                ? '⚠ saldo baixo — recarregue agora'
                : 'créditos de imagem e vídeo'}
          </div>
          <TopUpButton />
        </div>
        <div className="card stat">
          <div className="k">Taxa de falha (7d)</div>
          <div className="v">
            {failureRate}
            <small>%</small>
          </div>
          <div className="d">pausa automática &gt; 30%</div>
        </div>
      </div>
      <h2>Lotes recentes</h2>
      <div className="card tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Lote</th>
              <th>Modelo</th>
              <th>Produto</th>
              <th className="num">Vídeos</th>
              <th className="num">Custo</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {recentBatches.length === 0 && (
              <tr>
                <td colSpan={6}>Nenhum lote ainda.</td>
              </tr>
            )}
            {recentBatches.map((b, idx) => {
              const model = one(b.models);
              const product = one(b.products);
              const st = BATCH_STATUS_LABEL[b.status] ?? { label: b.status, cls: 'p-mut' };
              return (
                <tr key={b.id}>
                  <td>#{String(idx + 1).padStart(4, '0')}</td>
                  <td>{model?.name ?? '—'}</td>
                  <td>{product?.title ?? '—'}</td>
                  <td className="num">{b.video_count}</td>
                  <td className="num">{formatUsd(b.estimated_cost_usd ?? 0)}</td>
                  <td>
                    <span className={'pill ' + st.cls}>
                      <i></i>
                      {st.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
