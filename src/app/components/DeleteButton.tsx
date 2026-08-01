'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function DeleteButton({
  url,
  confirmMessage,
  label = '🗑 Excluir',
  redirectTo,
  small = false,
}: {
  url: string;
  confirmMessage: string;
  label?: string;
  redirectTo?: string;
  small?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!window.confirm(confirmMessage)) return;
    setLoading(true);
    try {
      const res = await fetch(url, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(typeof body?.error === 'string' ? body.error : 'Não foi possível excluir.');
        return;
      }
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    } catch {
      window.alert('Não foi possível excluir. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      className="btn danger"
      style={small ? { padding: '3px 10px', fontSize: 12 } : undefined}
      disabled={loading}
      onClick={handleDelete}
    >
      {loading ? 'Excluindo…' : label}
    </button>
  );
}
