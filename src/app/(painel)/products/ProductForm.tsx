'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UPLOAD_ACCEPT, uploadImage, validateImageFile } from '@/lib/upload';
import { Modal } from '@/app/components/Modal';

export function ProductForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceBrl, setPriceBrl] = useState('');
  const [imageUrls, setImageUrls] = useState('');
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setUploading(true);
    try {
      for (const f of files) {
        const url = await uploadImage('product-images', f);
        setImageUrls((prev) => [prev.trim(), url].filter(Boolean).join(', '));
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
        const flat = body?.error;
        setError(typeof flat === 'string' ? flat : flat?.formErrors?.[0] ?? 'Não foi possível cadastrar o produto.');
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
        <Modal title="Cadastrar produto" onClose={() => setOpen(false)} busy={loading || uploading}>
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
                {loading ? 'Cadastrando…' : 'Cadastrar produto'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
