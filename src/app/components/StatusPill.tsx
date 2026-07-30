import { STATUS_LABEL, type JobStatus } from '@/types';

const CLASS_BY_STATUS: Record<JobStatus, string> = {
  completed: 'p-ok',
  generating: 'p-cyan',
  composing: 'p-cyan',
  queued: 'p-mut',
  ready: 'p-mut',
  draft: 'p-mut',
  failed: 'p-err',
};

export function StatusPill({ status }: { status: JobStatus }) {
  const cls = CLASS_BY_STATUS[status] ?? 'p-mut';
  return (
    <span className={'pill ' + cls}>
      <i></i>
      {STATUS_LABEL[status]}
    </span>
  );
}
