import { createServerSupabase } from '@/lib/supabase/server';
import { ScriptSchema, type JobStatus } from '@/types';
import { StatusPill } from '@/app/components/StatusPill';
import { DeleteButton } from '@/app/components/DeleteButton';

type BatchInfo = {
  models: { name: string } | { name: string }[] | null;
  products: { title: string } | { title: string }[] | null;
};

type JobRow = {
  id: string;
  batch_id: string | null;
  script: unknown;
  video_url: string | null;
  composed_image_url: string | null;
  status: JobStatus;
  cost_usd: number | null;
  error: string | null;
  retry_count: number;
  created_at: string;
  dispatched_at: string | null;
  completed_at: string | null;
  video_batches: BatchInfo | BatchInfo[] | null;
};

import { one } from '@/lib/labels';
import { formatUsd } from '@/lib/cost';
import { formatDuration, groupTimings } from '@/lib/timings';

export default async function VideosPage() {
  let jobs: JobRow[] = [];
  try {
    const supabase = await createServerSupabase();
    const { data } = await supabase
      .from('video_jobs')
      .select('id,batch_id,script,video_url,composed_image_url,status,cost_usd,error,retry_count,created_at,dispatched_at,completed_at,video_batches(models(name),products(title))')
      .order('created_at', { ascending: false });
    jobs = (data as unknown as JobRow[]) ?? [];
  } catch {
    jobs = [];
  }

  const readyCount = jobs.filter((j) => j.status === 'completed').length;
  const generatingCount = jobs.filter((j) => j.status === 'generating' || j.status === 'composing').length;
  const failedCount = jobs.filter((j) => j.status === 'failed').length;
  const overall = groupTimings(jobs);

  // Agrupa por lote (modelo + produto) preservando a ordem dos mais recentes.
  const groups: { key: string; jobs: JobRow[] }[] = [];
  const byBatch = new Map<string, JobRow[]>();
  for (const job of jobs) {
    const key = job.batch_id ?? 'sem-lote';
    if (!byBatch.has(key)) {
      const list: JobRow[] = [];
      byBatch.set(key, list);
      groups.push({ key, jobs: list });
    }
    byBatch.get(key)!.push(job);
  }

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
        {overall && (
          <span className="pill p-mut" title="Média da etapa de animação (não inclui a composição da imagem)">
            ⏱ animação média: {formatDuration(overall.avgMs)}/vídeo
          </span>
        )}
      </div>
      {jobs.length === 0 ? (
        <div className="card" style={{ padding: 18 }}>
          Nenhum vídeo ainda.
        </div>
      ) : (
        groups.map((group) => {
          const first = group.jobs[0];
          const batchInfo = one(first.video_batches);
          const model = batchInfo ? one(batchInfo.models) : null;
          const product = batchInfo ? one(batchInfo.products) : null;
          const timings = groupTimings(group.jobs);
          const doneInGroup = group.jobs.filter((j) => j.status === 'completed').length;

          return (
            <div key={group.key} style={{ marginBottom: 26 }}>
              <h2 style={{ marginTop: 0 }}>
                {model?.name ?? 'Modelo'} · {product?.title ?? 'Produto'}
              </h2>
              <div className="filters" style={{ marginBottom: 10 }}>
                <span className="pill p-mut">{group.jobs.length} vídeos · {doneInGroup} prontos</span>
                {timings && (
                  <>
                    <span className="pill p-mut" title={`Média da etapa de animação — não inclui a composição (${timings.sample} vídeo(s) pronto(s))`}>
                      ⏱ animação: {formatDuration(timings.avgMs)}/vídeo
                    </span>
                    <span className="pill p-mut" title="Da 1ª animação iniciada à última entrega do grupo">
                      🏁 janela de entrega: {formatDuration(timings.totalMs)}
                    </span>
                  </>
                )}
              </div>
              <div className="vidgrid">
                {group.jobs.map((job) => {
                  const parsed = ScriptSchema.safeParse(job.script);
                  const title = parsed.success ? parsed.data.title : 'Sem título';

                  return (
              <div className="card vid" key={job.id}>
                {job.status === 'completed' && job.video_url ? (
                  <div className="thumb">
                    <video
                      controls
                      src={job.video_url}
                      poster={job.composed_image_url ?? undefined}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                ) : (
                  <div className="thumb">
                    {job.composed_image_url && (
                      // Preview da composição modelo + produto enquanto o vídeo não chega.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={job.composed_image_url}
                        alt="Composição modelo + produto"
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    )}
                    <StatusPill status={job.status} />
                  </div>
                )}
                <div className="card-body">
                  <b>{title}</b>
                  {job.status === 'failed' && (
                    <div className="d">
                      {job.error ?? 'Erro desconhecido'} · tentativa {job.retry_count}/3
                    </div>
                  )}
                  <div className="d">
                    {job.cost_usd != null && job.cost_usd > 0 ? formatUsd(job.cost_usd) : ''}
                    {job.status === 'completed' && job.dispatched_at && job.completed_at
                      ? `${job.cost_usd ? ' · ' : ''}⏱ ${formatDuration(new Date(job.completed_at).getTime() - new Date(job.dispatched_at).getTime())}`
                      : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    {job.status === 'completed' && job.video_url && (
                      <>
                        <a href={job.video_url} download className="btn" style={{ padding: '4px 10px', fontSize: 12 }}>
                          Baixar
                        </a>
                        {job.composed_image_url && (
                          <a href={job.composed_image_url} target="_blank" rel="noreferrer" className="btn" style={{ padding: '4px 10px', fontSize: 12 }} title="Abrir a imagem composta modelo + produto">
                            Composição
                          </a>
                        )}
                      </>
                    )}
                    <DeleteButton
                      url={`/api/jobs/${job.id}`}
                      confirmMessage="Excluir este vídeo da plataforma? (Se já baixou o arquivo, ele continua no seu computador.)"
                      label="🗑"
                      small
                    />
                  </div>
                </div>
              </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}
