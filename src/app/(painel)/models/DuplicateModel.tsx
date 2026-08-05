'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Modal } from '@/app/components/Modal';

export type DuplicateProduct = { id: string; title: string };

/**
 * Duplica a modelo mantendo o rosto (mesmas referências) e trocando o produto.
 * variant='button': página de detalhe — sucesso navega para a cópia.
 * variant='cardAction': card da listagem — sucesso faz refresh da grade.
 */
export function DuplicateModel({
  modelId,
  modelName,
  currentProductId,
  products,
  variant,
  thumbUrl,
}: {
  modelId: string;
  modelName: string;
  currentProductId: string | null;
  products: DuplicateProduct[];
  variant: 'button' | 'cardAction';
  thumbUrl: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(`${modelName} (2)`);
  // Caso de uso principal é TROCAR: pré-seleciona o primeiro produto ≠ atual.
  const firstOther = products.find((p) => p.id !== currentProductId) ?? products[0];
  const [productId, setProductId] = useState(firstOther?.id ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!productId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/models/${modelId}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, name }),
      });
      const body = await res.json();
      if (!res.ok) {
        const flat = body?.error;
        setError(
          res.status === 401
            ? 'Sessão expirada — recarregue a página.'
            : typeof flat === 'string' ? flat : flat?.formErrors?.[0] ?? 'Não foi possível duplicar. Tente novamente.',
        );
        return;
      }
      setOpen(false);
      if (variant === 'button') router.push(`/models/${body.modelId}`);
      else router.refresh();
    } catch {
      setError('Não foi possível duplicar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn"
        style={variant === 'cardAction' ? { padding: '3px 10px', fontSize: 12 } : undefined}
        aria-label={`Duplicar modelo ${modelName}`}
        onClick={() => setOpen(true)}
      >
        ⧉ Duplicar
      </button>
      {open && (
        <Modal title="Duplicar modelo" onClose={() => setOpen(false)} busy={loading} maxWidth={440}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {thumbUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbUrl}
                alt={modelName}
                style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }}
              />
            )}
            <div>
              <b>{modelName}</b>
              <div className="sub" style={{ fontSize: 11.5 }}>mesmo rosto, mesmas referências</div>
            </div>
            <span className="pill p-ok" style={{ marginLeft: 'auto' }}>
              <i></i>custo US$ 0,00
            </span>
          </div>
          {products.length === 0 ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <span className="sub">
                Cadastre um produto primeiro — a duplicação existe para vender outro produto com o mesmo rosto.
              </span>
              <Link href="/products" className="btn">
                Ir para Produtos →
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
              <label className="lbl">
                <span className="sub">Nome da cópia</span>
                <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </label>
              <label className="lbl">
                <span className="sub">Novo produto</span>
                <select className="field" value={productId} onChange={(e) => setProductId(e.target.value)}>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                      {p.id === currentProductId ? ' — atual' : ''}
                    </option>
                  ))}
                </select>
              </label>
              {error && <div className="alert">{error}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => setOpen(false)} disabled={loading}>
                  Cancelar
                </button>
                <button type="submit" className="btn primary" disabled={loading}>
                  {loading ? 'Duplicando…' : '⧉ Duplicar'}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
