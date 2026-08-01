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

  return (
    <>
      <button className="new-card" onClick={() => setOpen(true)} type="button">
        <span className="plus">+</span>
        <b>Cadastrar produto</b>
        <span>fotos, título e descrição</span>
      </button>
      {open && (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Cadastrar produto"
          onClick={(e) => {
            if (e.target === e.currentTarget && !loading) setOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !loading) setOpen(false);
          }}
        >
          <div className="modal">
            <div className="modal-head">
              <b>Cadastrar produto</b>
              <button
                type="button"
                className="modal-close"
                aria-label="Fechar"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
              <label className="lbl">
                <span className="sub">Título</span>
                <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
              </label>
              <label className="lbl">
                <span className="sub">Descrição</span>
                <textarea
                  className="field"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="O que é, material, diferenciais…"
                />
              </label>
              <label className="lbl">
                <span className="sub">Preço (R$)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="field"
                  value={priceBrl}
                  onChange={(e) => setPriceBrl(e.target.value)}
                  placeholder="99,90"
                />
              </label>
              <label className="lbl">
                <span className="sub">URLs das fotos (separadas por vírgula)</span>
                <textarea
                  className="field"
                  value={imageUrls}
                  onChange={(e) => setImageUrls(e.target.value)}
                  placeholder="https://…, https://…"
                />
                <span className="sub" style={{ fontSize: 11.5 }}>
                  Cole URLs públicas das fotos do produto — a 1ª é usada na composição com a modelo.
                </span>
              </label>
              {error && <div className="alert">{error}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => setOpen(false)} disabled={loading}>
                  Cancelar
                </button>
                <button type="submit" className="btn primary" disabled={loading}>
                  {loading ? 'Cadastrando…' : 'Cadastrar produto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
