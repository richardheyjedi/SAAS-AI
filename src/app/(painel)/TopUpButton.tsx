'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/app/components/Modal';

const AMOUNTS = [5, 10, 20, 50];

export function TopUpButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);

  async function handleTopUp() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/muapi/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      });
      const body = await res.json();
      if (!res.ok) {
        const flat = body?.error;
        setError(typeof flat === 'string' ? flat : flat?.formErrors?.[0] ?? 'Não foi possível gerar o pagamento.');
        return;
      }
      window.open(body.checkoutUrl, '_blank', 'noopener');
      setOpened(true);
    } catch {
      setError('Não foi possível gerar o pagamento. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" className="btn" style={{ padding: '3px 10px', fontSize: 12, marginTop: 6 }} onClick={() => setOpen(true)}>
        + Recarregar
      </button>
      {open && (
        <Modal title="Recarregar créditos MuAPI" onClose={() => setOpen(false)} busy={loading} maxWidth={420}>
          <div className="lbl">
            <span className="sub">Valor (US$)</span>
            <div className="seg" role="group" aria-label="Valor da recarga">
              {AMOUNTS.map((v, i) => (
                <button
                  key={v}
                  type="button"
                  className={amount === v ? 'on' : ''}
                  onClick={() => setAmount(v)}
                  autoFocus={i === 0}
                >
                  ${v}
                </button>
              ))}
            </div>
            <span className="sub" style={{ fontSize: 11.5 }}>
              O pagamento abre no checkout seguro do Stripe (cartão) — o crédito cai na conta MuAPI assim que
              confirmado. Referência: US$ 10 ≈ 30 vídeos de 5s no Mini.
            </span>
          </div>
          {opened && (
            <div className="pill p-ok" style={{ whiteSpace: 'normal' }}>
              Checkout aberto em outra aba. Depois de pagar, volte aqui — o botão abaixo atualiza o saldo e
              retoma qualquer vídeo pausado por falta de crédito.
            </div>
          )}
          {error && <div className="alert">{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {opened ? (
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  // Religa a fila: vídeos pausados por saldo voltam a andar já.
                  fetch('/api/queue/kick', { method: 'POST' }).catch(() => {});
                  setOpen(false);
                  router.refresh();
                }}
              >
                Já paguei — atualizar saldo e retomar a fila
              </button>
            ) : (
              <button type="button" className="btn primary" disabled={loading} onClick={handleTopUp}>
                {loading ? 'Gerando pagamento…' : `Pagar US$ ${amount} no Stripe →`}
              </button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
