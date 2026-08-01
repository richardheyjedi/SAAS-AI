'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Script } from '@/types';

export function EditScript({ jobId, script }: { jobId: string; script: Script }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(script.title);
  const [hook, setHook] = useState(script.hook);
  const [speech, setSpeech] = useState(script.speech ?? '');
  const [scene, setScene] = useState(script.scene_description);
  const [motion, setMotion] = useState(script.motion_prompt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, hook, scene_description: scene, motion_prompt: motion,
          speech: speech.trim() || undefined,
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
        ✎ Editar roteiro
      </button>
      {open && (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`Editar roteiro ${script.title}`}
          onClick={(e) => {
            if (e.target === e.currentTarget && !loading) setOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !loading) setOpen(false);
          }}
        >
          <div className="modal">
            <div className="modal-head">
              <b>Editar roteiro</b>
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
                <span className="sub">Título (mín. 3 caracteres)</span>
                <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
              </label>
              <label className="lbl">
                <span className="sub">Gancho — a primeira fala/chamada (mín. 5)</span>
                <textarea className="field" style={{ minHeight: 54 }} value={hook} onChange={(e) => setHook(e.target.value)} />
              </label>
              <label className="lbl">
                <span className="sub">🗣 Fala — o que a modelo DIZ olhando para a câmera (em português; vira voz com som ligado)</span>
                <textarea
                  className="field"
                  style={{ minHeight: 54 }}
                  value={speech}
                  onChange={(e) => setSpeech(e.target.value)}
                  placeholder='Ex.: "gente, esse achado é surreal — corre que tá acabando!"'
                  maxLength={200}
                />
              </label>
              <label className="lbl">
                <span className="sub">Cena — descreve a IMAGEM base, em inglês (mín. 20)</span>
                <textarea className="field" value={scene} onChange={(e) => setScene(e.target.value)} />
              </label>
              <label className="lbl">
                <span className="sub">Movimento — descreve a ANIMAÇÃO, em inglês (mín. 20)</span>
                <textarea className="field" value={motion} onChange={(e) => setMotion(e.target.value)} />
              </label>
              {error && <div className="alert">{error}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => setOpen(false)} disabled={loading}>
                  Cancelar
                </button>
                <button type="submit" className="btn primary" disabled={loading}>
                  {loading ? 'Salvando…' : 'Salvar roteiro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
