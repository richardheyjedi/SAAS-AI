import { createServerSupabase } from '@/lib/supabase/server';
import { ScriptSchema, type JobStatus } from '@/types';
import { StatusPill } from '@/app/components/StatusPill';

type BatchInfo = {
  models: { name: string } | { name: string }[] | null;
  products: { title: string } | { title: string }[] | null;
};

type JobRow = {
  id: string;
  script: unknown;
  video_url: string | null;
  status: JobStatus;
  cost_usd: number | null;
  error: string | null;
  retry_count: number;
  video_batches: BatchInfo | BatchInfo[] | null;
};

function one<T>(rel: T | T[] | null): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

function formatUsd(v: number): string {
  return 'US$ ' + v.toFixed(2).replace('.', ',');
}

export default async function VideosPage() {
  let jobs: JobRow[] = [];
  try {
    const supabase = await createServerSupabase();
    const { data } = await supabase
      .from('video_jobs')
      .select('id,script,video_url,status,cost_usd,error,retry_count,video_batches(models(name),products(title))')
      .order('created_at', { ascending: false });
    jobs = (data as unknown as JobRow[]) ?? [];
  } catch {
    jobs = [];
  }

  const readyCount = jobs.filter((j) => j.status === 'completed').length;
  const generatingCount = jobs.filter((j) => j.status === 'generating' || j.status === 'composing').length;
  const failedCount = jobs.filter((j) => j.status === 'failed').length;

  return (
    <section className="screen on">
      <div className="head">
        <div>
          <h1>Vídeos</h1>
          <div className="sub">Todos os vídeos gerados</div>
        </div>
      </div>
      <div className="banner">
        ⚠{' '}
        <span>
          <b>Lembrete:</b> distribua as postagens ao longo do dia e marque como conteúdo de IA quando o TikTok exigir
          — volume alto de posts idênticos pode ser sinalizado como spam.
        </span>
      </div>
      <details className="guide" style={{ marginBottom: 14 }}>
        <summary>🎬 Como funciona o fluxo e onde seus vídeos ficam armazenados</summary>
        <ul>
          <li><b>1. Roteiro</b> — ao criar o lote, a IA de texto escreve um roteiro por vídeo (título, gancho, cena e movimento).</li>
          <li><b>2. Composição</b> — o motor de imagem junta a foto <b>base</b> da modelo com a 1ª foto do produto numa imagem vertical 9:16.</li>
          <li><b>3. Animação</b> — o Seedance transforma essa imagem no clipe final. A fila processa sozinha, em etapas, a cada ciclo do cron.</li>
          <li><b>4. Entrega</b> — o vídeo pronto aparece nesta tela com player e botão Baixar.</li>
          <li><b>📦 Armazenamento:</b> os arquivos ficam na CDN da MuAPI, e os links têm <b>validade limitada (~30 dias)</b> — <b>baixe e guarde</b> os vídeos que quiser manter (o botão Baixar salva o MP4 no seu computador).</li>
          <li>Estados possíveis de cada vídeo: Na fila → Compondo → Gerando → Pronto (ou Falhou, com nova tentativa automática até 3×).</li>
        </ul>
      </details>
      <div className="filters">
        <span className="pill p-mut">Todos · {jobs.length}</span>
        <span className="pill p-ok">
          <i></i>Prontos · {readyCount}
        </span>
        <span className="pill p-cyan">
          <i></i>Gerando · {generatingCount}
        </span>
        <span className="pill p-err">
          <i></i>Falhou · {failedCount}
        </span>
      </div>
      {jobs.length === 0 ? (
        <div className="card" style={{ padding: 18 }}>
          Nenhum vídeo ainda.
        </div>
      ) : (
        <div className="vidgrid">
          {jobs.map((job) => {
            const parsed = ScriptSchema.safeParse(job.script);
            const title = parsed.success ? parsed.data.title : 'Sem título';
            const batchInfo = one(job.video_batches);
            const model = batchInfo ? one(batchInfo.models) : null;
            const product = batchInfo ? one(batchInfo.products) : null;

            return (
              <div className="card vid" key={job.id}>
                {job.status === 'completed' && job.video_url ? (
                  <div className="thumb">
                    <video controls src={job.video_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ) : (
                  <div className="thumb">
                    <StatusPill status={job.status} />
                  </div>
                )}
                <div className="card-body">
                  <b>{title}</b>
                  <div className="d">
                    {model?.name ?? '—'} · {product?.title ?? '—'}
                  </div>
                  {job.status === 'failed' && (
                    <div className="d">
                      {job.error ?? 'Erro desconhecido'} · tentativa {job.retry_count}/3
                    </div>
                  )}
                  {job.cost_usd != null && job.cost_usd > 0 && <div className="d">{formatUsd(job.cost_usd)}</div>}
                  {job.status === 'completed' && job.video_url && (
                    <a href={job.video_url} download className="btn" style={{ marginTop: 6, padding: '4px 10px', fontSize: 12 }}>
                      Baixar
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
