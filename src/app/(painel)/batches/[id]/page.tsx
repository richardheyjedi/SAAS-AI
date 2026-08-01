import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { ScriptSchema, STATUS_LABEL, type JobStatus } from '@/types';
import { ApproveButton } from './ApproveButton';
import { EditScript } from './EditScript';

type BatchRow = {
  id: string;
  video_count: number;
  duration_seconds: number;
  estimated_cost_usd: number;
  status: 'review' | 'approved' | 'done';
};

type JobRow = {
  id: string;
  script: unknown;
  status: JobStatus;
};

function formatUsd(v: number): string {
  return 'US$ ' + v.toFixed(2).replace('.', ',');
}

export default async function BatchReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let batch: BatchRow | null = null;
  let jobs: JobRow[] = [];

  try {
    const supabase = await createServerSupabase();
    const [batchRes, jobsRes] = await Promise.all([
      supabase.from('video_batches').select('*').eq('id', id).single(),
      supabase.from('video_jobs').select('id,script,status').eq('batch_id', id).order('created_at', { ascending: true }),
    ]);
    batch = batchRes.data ?? null;
    jobs = jobsRes.data ?? [];
  } catch {
    batch = null;
    jobs = [];
  }

  if (!batch) return notFound();

  if (batch.status === 'review') {
    return (
      <section className="screen on">
        <div className="head">
          <div>
            <h1>Revisão do lote</h1>
            <div className="sub">
              {jobs.length} roteiros · custo estimado {formatUsd(batch.estimated_cost_usd ?? 0)}
            </div>
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <ApproveButton batchId={batch.id} videoCount={batch.video_count} />
        </div>
        {jobs.map((job) => {
          const parsed = ScriptSchema.safeParse(job.script);
          if (!parsed.success) return null;
          const script = parsed.data;
          return (
            <div className="card step" key={job.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <h3 style={{ margin: 0 }}>{script.title}</h3>
                <EditScript jobId={job.id} script={script} />
              </div>
              <div className="d" style={{ fontStyle: 'italic', margin: '6px 0 8px' }}>
                {script.hook}
              </div>
              <small className="d" style={{ display: 'block' }}>🖼 {script.scene_description}</small>
              <small className="d" style={{ display: 'block', marginTop: 4 }}>🎬 {script.motion_prompt}</small>
            </div>
          );
        })}
      </section>
    );
  }

  const counts = jobs.reduce<Record<string, number>>((acc, j) => {
    acc[j.status] = (acc[j.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section className="screen on">
      <div className="head">
        <div>
          <h1>Lote #{batch.id.slice(0, 4)}</h1>
          <div className="sub">{batch.status === 'done' ? 'Concluído' : 'Em geração'}</div>
        </div>
        <Link href="/videos" className="btn primary">
          Ver vídeos
        </Link>
      </div>
      <div className="filters">
        {Object.entries(counts).map(([status, count]) => (
          <span className="pill p-mut" key={status}>
            {STATUS_LABEL[status as JobStatus] ?? status} · {count}
          </span>
        ))}
      </div>
    </section>
  );
}
