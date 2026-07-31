'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { DEFAULT_IMAGE_ENGINE, IMAGE_ENGINES } from '@/lib/engines';
import { imageCostUsd, modelRefsCostUsd } from '@/lib/cost';
import { CharacterSheetGuide } from './CharacterSheetGuide';

const REGIONS: { value: string; label: string }[] = [
  { value: 'br', label: '🇧🇷 Brasileira' },
  { value: 'us', label: '🇺🇸 Americana' },
  { value: 'us_latina', label: '🇺🇸 US · Latina' },
  { value: 'custom', label: 'Personalizada' },
];

const ACCEPTED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_FILE_MB = 8;
const MAX_ATTACHED = 10;
const AI_REF_OPTIONS = [0, 1, 2, 3, 4, 5];

export function ModelForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [region, setRegion] = useState('br');
  const [customPrompt, setCustomPrompt] = useState('');
  const [engine, setEngine] = useState(DEFAULT_IMAGE_ENGINE);
  const [refCount, setRefCount] = useState(3);
  const [refUrls, setRefUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalRefs = refUrls.length + refCount;

  async function handleFiles(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    const files = Array.from(list);
    for (const f of files) {
      if (!ACCEPTED_TYPES[f.type]) {
        setError(`Formato não suportado: ${f.name} — use JPG, PNG ou WebP.`);
        return;
      }
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        setError(`${f.name} passa de ${MAX_FILE_MB} MB.`);
        return;
      }
    }
    if (refUrls.length + files.length > MAX_ATTACHED) {
      setError(`Máximo de ${MAX_ATTACHED} fotos anexadas.`);
      return;
    }
    setUploading(true);
    try {
      const supabase = createBrowserSupabase();
      for (const f of files) {
        const path = `${crypto.randomUUID()}.${ACCEPTED_TYPES[f.type]}`;
        const { error: upErr } = await supabase.storage.from('model-refs').upload(path, f);
        if (upErr) throw upErr;
        const url = supabase.storage.from('model-refs').getPublicUrl(path).data.publicUrl;
        setRefUrls((prev) => [...prev, url]);
      }
    } catch (err) {
      setError(`Falha no upload: ${err instanceof Error ? err.message : 'erro desconhecido'}. Tente de novo.`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (totalRefs === 0) {
      setError('Anexe pelo menos uma foto ou gere referências por IA.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/models/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region,
          customPrompt: customPrompt || undefined,
          imageEngine: engine,
          refCount,
          referenceUrls: refUrls,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        const flat = body?.error;
        setError(
          typeof flat === 'string' ? flat : flat?.formErrors?.[0] ?? 'Não foi possível criar o modelo.',
        );
        return;
      }
      setOpen(false);
      setCustomPrompt('');
      setRefUrls([]);
      setRefCount(3);
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
        <span>com suas fotos, por IA, ou os dois</span>
      </button>
    );
  }

  return (
    <div className="card" style={{ padding: 16, display: 'grid', gap: 12 }}>
      <b>Criar modelo</b>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
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

        <div style={{ display: 'grid', gap: 6 }}>
          <span className="sub">Suas referências ({refUrls.length}/{MAX_ATTACHED})</span>
          {refUrls.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
              {refUrls.map((u, i) => (
                <span key={u} style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt={`Referência ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  {i === 0 && (
                    <span style={{ position: 'absolute', left: 2, bottom: 2, fontSize: 9, background: 'rgba(0,0,0,0.65)', color: '#fff', borderRadius: 4, padding: '1px 4px' }}>
                      base
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label={`Remover referência ${i + 1}`}
                    onClick={() => setRefUrls((prev) => prev.filter((x) => x !== u))}
                    style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: 9, border: 'none', cursor: 'pointer', background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 11, lineHeight: '18px', padding: 0 }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button type="button" className="btn" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? 'Enviando fotos…' : '+ Anexar fotos (JPG/PNG/WebP, até 8 MB)'}
          </button>
        </div>

        <div style={{ display: 'grid', gap: 4 }}>
          <span className="sub">Referências geradas por IA</span>
          <div className="seg" role="group" aria-label="Quantidade de referências por IA" style={{ display: 'flex' }}>
            {AI_REF_OPTIONS.map((n) => (
              <button key={n} type="button" className={refCount === n ? 'on' : ''} onClick={() => setRefCount(n)}>
                {n}
              </button>
            ))}
          </div>
          <span className="sub" style={{ fontSize: 11.5 }}>
            {refCount === 0
              ? 'Nenhuma — só as suas fotos (custo US$ 0,00)'
              : `${refCount} imagem(ns) ≈ US$ ${modelRefsCostUsd(engine, refCount).toFixed(2).replace('.', ',')} (estimativa)`}
          </span>
        </div>

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
        </label>

        <CharacterSheetGuide />

        {error && <div className="pill p-err">{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="btn primary" disabled={loading || uploading || totalRefs === 0}>
            {loading ? 'Criando modelo…' : 'Criar modelo'}
          </button>
          <button type="button" className="btn" onClick={() => setOpen(false)} disabled={loading}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
