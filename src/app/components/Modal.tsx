'use client';

/**
 * Esqueleto único de modal: overlay com fechamento por Esc e clique no fundo
 * (ambos bloqueados enquanto `busy`), cabeçalho com título e botão ×.
 * O chamador coloca `autoFocus` no primeiro controle do conteúdo — sem um
 * elemento focado DENTRO do overlay, o Esc não chega ao onKeyDown.
 */
export function Modal({
  title,
  onClose,
  busy = false,
  maxWidth,
  children,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  maxWidth?: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !busy) onClose();
      }}
    >
      <div className="modal" style={maxWidth ? { maxWidth } : undefined}>
        <div className="modal-head">
          <b>{title}</b>
          <button type="button" className="modal-close" aria-label="Fechar" onClick={onClose} disabled={busy}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
