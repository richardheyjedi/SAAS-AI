'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_IMAGE_ENGINE, IMAGE_ENGINES } from '@/lib/engines';
import { imageCostUsd, modelRefsCostUsd } from '@/lib/cost';
import { REGION_LABEL } from '@/lib/labels';
import { UPLOAD_ACCEPT, uploadImage, validateImageFile } from '@/lib/upload';
import { Modal } from '@/app/components/Modal';
import { CharacterSheetGuide } from './CharacterSheetGuide';

const MAX_ATTACHED = 10;
const AI_REF_OPTIONS = [0, 1, 2, 3, 4, 5];

export type ModelFormProduct = { id: string; title: string };

export function ModelForm({ products }: { products: ModelFormProduct[] }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [region, setRegion] = useState('br');
  const [gender, setGender] = useState<'female' | 'male'>('female');
  const [productId, setProductId] = useState('');
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
    try {
      files.forEach(validateImageFile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Arquivo inválido.');
      return;
    }
    if (refUrls.length + files.length > MAX_ATTACHED) {
      setError(`Máximo de ${MAX_ATTACHED} fotos anexadas.`);
      return;
    }
    setUploading(true);
    try {
      for (const f of files) {
        const url = await uploadImage('model-refs', f);
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
          gender,
          customPrompt: customPrompt || undefined,
          imageEngine: engine,
          refCount,
          referenceUrls: refUrls,
          productId: productId || undefined,
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

  return (
    <>
      <button className="new-card" onClick={() => setOpen(true)} type="button">
        <span className="plus">+</span>
        <b>Criar modelo</b>
        <span>com suas fotos, por IA, ou os dois</span>
      </button>
      {open && (
        <Modal title="Criar modelo" onClose={() => setOpen(false)} busy={loading || uploading}>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
            <label className="lbl">
              <span className="sub">Região</span>
              <select className="field" value={region} onChange={(e) => setRegion(e.target.value)} autoFocus>
                {Object.entries(REGION_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="lbl">
              <span className="sub">Sexo da persona</span>
              <div className="seg" role="group" aria-label="Sexo da persona">
                <button type="button" className={gender === 'female' ? 'on' : ''} onClick={() => setGender('female')}>
                  ♀ Feminino
                </button>
                <button type="button" className={gender === 'male' ? 'on' : ''} onClick={() => setGender('male')}>
                  ♂ Masculino
                </button>
              </div>
            </div>
            <label className="lbl">
              <span className="sub">Produto relacionado (opcional — a persona nasce alinhada a ele)</span>
              <select className="field" value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">Nenhum — persona genérica</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="lbl">
              <span className="sub">Prompt personalizado (opcional)</span>
              <textarea
                className="field"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Descreva a persona desejada…"
              />
            </label>

            <div className="lbl">
              <span className="sub">
                Suas referências ({refUrls.length}/{MAX_ATTACHED})
              </span>
              {refUrls.length > 0 && (
                <div className="thumbgrid">
                  {refUrls.map((u, i) => (
                    <span key={u} className="ref">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt={`Referência ${i + 1}`} />
                      {i === 0 && <span className="tag">base</span>}
                      <button
                        type="button"
                        className="rm"
                        aria-label={`Remover referência ${i + 1}`}
                        onClick={() => setRefUrls((prev) => prev.filter((x) => x !== u))}
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
                accept={UPLOAD_ACCEPT}
                multiple
                style={{ display: 'none' }}
                onChange={(e) => handleFiles(e.target.files)}
              />
              <button type="button" className="btn" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                {uploading ? 'Enviando fotos…' : '+ Anexar fotos (JPG/PNG/WebP, até 8 MB)'}
              </button>
            </div>

            <div className="lbl">
              <span className="sub">Referências geradas por IA</span>
              <div className="seg" role="group" aria-label="Quantidade de referências por IA">
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

            <div className="lbl">
              <span className="sub">Motor de imagem</span>
              <div className="opt2">
                {IMAGE_ENGINES.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    className={'choice' + (engine === e.id ? ' sel' : '')}
                    onClick={() => setEngine(e.id)}
                  >
                    <b>{e.label}</b>
                    <small>US$ {imageCostUsd(e.id).toFixed(2).replace('.', ',')}/imagem</small>
                  </button>
                ))}
              </div>
            </div>

            <CharacterSheetGuide />

            {error && <div className="alert">{error}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setOpen(false)} disabled={loading}>
                Cancelar
              </button>
              <button type="submit" className="btn primary" disabled={loading || uploading || totalRefs === 0}>
                {loading ? 'Criando modelo…' : 'Criar modelo'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
