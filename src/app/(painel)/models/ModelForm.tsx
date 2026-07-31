'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IMAGE_ENGINES, DEFAULT_IMAGE_ENGINE } from '@/lib/engines';
import { imageCostUsd, modelRefsCostUsd } from '@/lib/cost';

const REGIONS: { value: string; label: string }[] = [
  { value: 'br', label: '🇧🇷 Brasileira' },
  { value: 'us', label: '🇺🇸 Americana' },
  { value: 'us_latina', label: '🇺🇸 US · Latina' },
  { value: 'custom', label: 'Personalizada' },
];

export function ModelForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [region, setRegion] = useState('br');
  const [customPrompt, setCustomPrompt] = useState('');
  const [engine, setEngine] = useState(DEFAULT_IMAGE_ENGINE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/models/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region, customPrompt: customPrompt || undefined, imageEngine: engine }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'Não foi possível criar o modelo.');
        return;
      }
      setOpen(false);
      setCustomPrompt('');
      router.refresh();
    } catch {
      setError('Não foi possível criar o modelo. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button className="new-card" onClick={() => setOpen(true)} type="button">
        <span className="plus">+</span>
        <b>Criar modelo</b>
        <span>por região ou prompt personalizado</span>
      </button>
    );
  }

  return (
    <div className="card" style={{ padding: 16, display: 'grid', gap: 10 }}>
      <b>Criar modelo</b>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 10 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span className="sub">Região</span>
          <select
            className="btn"
            style={{ fontWeight: 400, width: '100%' }}
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          >
            {REGIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span className="sub">Prompt personalizado (opcional)</span>
          <textarea
            className="btn"
            style={{ fontWeight: 400, width: '100%', minHeight: 70, textAlign: 'left' }}
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="Descreva a persona desejada…"
          />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span className="sub">Motor de imagem</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {IMAGE_ENGINES.map((e) => (
              <button
                key={e.id}
                type="button"
                className={'btn' + (engine === e.id ? ' primary' : '')}
                style={{ flex: 1, fontWeight: 400 }}
                onClick={() => setEngine(e.id)}
              >
                {e.label}
                <small style={{ display: 'block' }}>
                  US$ {imageCostUsd(e.id).toFixed(2).replace('.', ',')}/imagem
                </small>
              </button>
            ))}
          </div>
          <span className="sub" style={{ fontSize: 11.5 }}>
            3 referências ≈ US$ {modelRefsCostUsd(engine, 3).toFixed(2).replace('.', ',')} (estimativa)
          </span>
        </label>
        {error && <div className="pill p-err">{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="btn primary" disabled={loading}>
            {loading ? 'Gerando persona e referências…' : 'Criar modelo'}
          </button>
          <button type="button" className="btn" onClick={() => setOpen(false)} disabled={loading}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
