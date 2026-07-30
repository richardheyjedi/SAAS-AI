'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ProductForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceBrl, setPriceBrl] = useState('');
  const [imageUrls, setImageUrls] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const urls = imageUrls
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean);
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          priceBrl: priceBrl ? Number(priceBrl) : undefined,
          imageUrls: urls,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'Não foi possível cadastrar o produto.');
        return;
      }
      setOpen(false);
      setTitle('');
      setDescription('');
      setPriceBrl('');
      setImageUrls('');
      router.refresh();
    } catch {
      setError('Não foi possível cadastrar o produto. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button className="new-card" onClick={() => setOpen(true)} type="button">
        <span className="plus">+</span>
        <b>Cadastrar produto</b>
        <span>fotos, título e descrição</span>
      </button>
    );
  }

  return (
    <div className="card" style={{ padding: 16, display: 'grid', gap: 10 }}>
      <b>Cadastrar produto</b>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 10 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span className="sub">Título</span>
          <input
            className="btn"
            style={{ fontWeight: 400, width: '100%' }}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span className="sub">Descrição</span>
          <textarea
            className="btn"
            style={{ fontWeight: 400, width: '100%', minHeight: 60, textAlign: 'left' }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span className="sub">Preço (R$)</span>
          <input
            type="number"
            step="0.01"
            className="btn"
            style={{ fontWeight: 400, width: '100%' }}
            value={priceBrl}
            onChange={(e) => setPriceBrl(e.target.value)}
          />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span className="sub">URLs das fotos (separadas por vírgula)</span>
          <textarea
            className="btn"
            style={{ fontWeight: 400, width: '100%', minHeight: 60, textAlign: 'left' }}
            value={imageUrls}
            onChange={(e) => setImageUrls(e.target.value)}
            placeholder="https://…, https://…"
          />
          <span className="sub" style={{ fontSize: 11.5 }}>
            cole URLs públicas das fotos do produto
          </span>
        </label>
        {error && <div className="pill p-err">{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="btn primary" disabled={loading}>
            {loading ? 'Cadastrando…' : 'Cadastrar produto'}
          </button>
          <button type="button" className="btn" onClick={() => setOpen(false)} disabled={loading}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
