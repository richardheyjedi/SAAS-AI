'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { imageCostUsd } from '@/lib/cost';
import { UPLOAD_ACCEPT, uploadImage, validateImageFile } from '@/lib/upload';
import { addModelReferences } from '../actions';

const COUNT_OPTIONS = [1, 2, 3, 4, 5];

export function ManageRefs({ modelId, engineId }: { modelId: string; engineId: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [adjust, setAdjust] = useState('');
  const [count, setCount] = useState(3);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  let costLabel = '';
  try {
    costLabel = `≈ US$ ${(imageCostUsd(engineId) * count).toFixed(2).replace('.', ',')}`;
  } catch {
    costLabel = '';
  }

  async function handleFiles(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    setNotice(null);
    const files = Array.from(list);
    try {
      files.forEach(validateImageFile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Arquivo inválido.');
      return;
    }
    setUploading(true);
    const uploaded: string[] = [];
    try {
      for (const f of files) {
        uploaded.push(await uploadImage('model-refs', f));
      }
    } catch (err) {
      setError(`Falha no upload: ${err instanceof Error ? err.message : 'erro desconhecido'}. Tente de novo.`);
    } finally {
      // Persiste o que subiu com sucesso mesmo se um arquivo posterior falhou.
      if (uploaded.length > 0) {
        await addModelReferences(modelId, uploaded);
        setNotice(`${uploaded.length} foto(s) adicionada(s) ao character sheet.`);
        router.refresh();
      }
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/models/${modelId}/refs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adjustPrompt: adjust.trim() || undefined, count }),
      });
      const body = await res.json();
      if (!res.ok) {
        const flat = body?.error;
        setError(typeof flat === 'string' ? flat : flat?.formErrors?.[0] ?? 'Não foi possível gerar.');
        return;
      }
      setAdjust('');
      setNotice(`${body.submitted} referência(s) em geração — chegam aqui em alguns minutos.`);
      router.refresh();
    } catch {
      setError('Não foi possível gerar. Tente novamente.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="card" style={{ padding: 16, display: 'grid', gap: 12, marginTop: 12 }}>
      <b style={{ fontSize: 14 }}>Ajustar o character sheet</b>

      <div className="lbl">
        <span className="sub">Adicionar fotos suas (manual)</span>
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
        <span className="sub">Gerar novas referências por IA (a partir da foto base, mesmo rosto)</span>
        <textarea
          className="field"
          value={adjust}
          onChange={(e) => setAdjust(e.target.value)}
          placeholder="Ajustes desejados — ex.: cabelo preso, luz mais quente, fundo de estúdio, sorriso mais discreto… (opcional)"
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div className="seg" role="group" aria-label="Quantidade de novas referências">
            {COUNT_OPTIONS.map((n) => (
              <button key={n} type="button" className={count === n ? 'on' : ''} onClick={() => setCount(n)}>
                {n}
              </button>
            ))}
          </div>
          <span className="sub" style={{ fontSize: 11.5 }}>{costLabel} (estimativa)</span>
          <button type="button" className="btn primary" disabled={generating} onClick={handleGenerate}>
            {generating ? 'Enviando…' : 'Gerar novas referências'}
          </button>
        </div>
      </div>

      {notice && <div className="pill p-ok" style={{ whiteSpace: 'normal' }}>{notice}</div>}
      {error && <div className="alert">{error}</div>}
    </div>
  );
}
