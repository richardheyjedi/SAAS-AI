'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UPLOAD_ACCEPT, uploadImages } from '@/lib/upload';

export type EditableProduct = {
  id: string;
  title: string;
  description: string;
  priceBrl: number | null;
  imageUrls: string[];
};

export function EditProduct({ product }: { product: EditableProduct }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(product.title);
  const [description, setDescription] = useState(product.description);
  const [priceBrl, setPriceBrl] = useState(product.priceBrl != null ? String(product.priceBrl) : '');
  const [imageUrls, setImageUrls] = useState(product.imageUrls.join(', '));
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    setUploading(true);
    try {
      const urls = await uploadImages('product-images', list);
      setImageUrls((prev) => [prev.trim(), ...urls].filter(Boolean).join(', '));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no upload. Tente de novo.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const urls = imageUrls
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean);
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          priceBrl: priceBrl ? Number(priceBrl) : null,
          imageUrls: urls,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        const flat = body?.error;
        setError(typeof flat === 'string' ? flat : flat?.formErrors?.[0] ?? 'Não foi possível salvar.');
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError('Não foi possível salvar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn"
        style={{ padding: '3px 10px', fontSize: 12 }}
        onClick={() => setOpen(true)}
      >
        ✎ Editar
      </button>
      {open && (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`Editar produto ${product.title}`}
          onClick={(e) => {
            if (e.target === e.currentTarget && !loading) setOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !loading) setOpen(false);
          }}
        >
          <div className="modal">
            <div className="modal-head">
              <b>Editar produto</b>
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
              <div className="lbl">
                <span className="sub">Fotos do produto</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={UPLOAD_ACCEPT}
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => handleFiles(e.target.files)}
                />
                <button type="button" className="btn" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                  {uploading ? 'Enviando fotos…' : '+ Anexar fotos do computador (JPG/PNG/WebP, até 8 MB)'}
                </button>
                <textarea
                  className="field"
                  value={imageUrls}
                  onChange={(e) => setImageUrls(e.target.value)}
                  placeholder="…ou cole URLs públicas separadas por vírgula"
                />
                <span className="sub" style={{ fontSize: 11.5 }}>
                  A 1ª foto é usada na composição com a modelo.
                </span>
              </div>
              {error && <div className="alert">{error}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => setOpen(false)} disabled={loading}>
                  Cancelar
                </button>
                <button type="submit" className="btn primary" disabled={loading || uploading}>
                  {loading ? 'Salvando…' : 'Salvar alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
