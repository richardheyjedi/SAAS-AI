'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ApproveButton({ batchId, videoCount }: { batchId: string; videoCount: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/batches/${batchId}/approve`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'Não foi possível aprovar o lote.');
        return;
      }
      router.push('/videos');
    } catch {
      setError('Não foi possível aprovar o lote. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {error && <div className="pill p-err">{error}</div>}
      <button type="button" className="btn primary" onClick={handleApprove} disabled={loading}>
        {loading ? 'Aprovando…' : `Aprovar e gerar ${videoCount} vídeos`}
      </button>
    </div>
  );
}
