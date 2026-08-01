'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { batchCostUsd, imageCostUsd, usdToBrl, videoCostUsd } from '@/lib/cost';
import { DEFAULT_IMAGE_ENGINE, DEFAULT_VIDEO_ENGINE, IMAGE_ENGINES, VIDEO_ENGINES, imageEngine, videoEngine } from '@/lib/engines';

export type BatchModel = {
  id: string;
  name: string;
  region: string;
  regionLabel: string;
  niche: string;
  thumb: string | null;
};

export type BatchProduct = {
  id: string;
  title: string;
  priceBrl: number | null;
  thumb: string | null;
};

const AV_CLASSES = ['av-1', 'av-2', 'av-3'];

function formatUsd(v: number): string {
  return 'US$ ' + v.toFixed(2).replace('.', ',');
}
function formatBrl(v: number): string {
  return 'R$ ' + v.toFixed(2).replace('.', ',');
}

export function BatchForm({ models, products }: { models: BatchModel[]; products: BatchProduct[] }) {
  const router = useRouter();
  const [modelId, setModelId] = useState<string | null>(models[0]?.id ?? null);
  const [productId, setProductId] = useState<string | null>(products[0]?.id ?? null);
  const [qty, setQty] = useState(10);
  const [duration, setDuration] = useState<5 | 10>(5);
  const [imgEngine, setImgEngine] = useState(DEFAULT_IMAGE_ENGINE);
  const [vidEngine, setVidEngine] = useState(DEFAULT_VIDEO_ENGINE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const perVideoUsd = videoCostUsd(vidEngine, duration);
  const videoLine = qty * perVideoUsd;
  const imageLine = qty * imageCostUsd(imgEngine);
  const total = useMemo(
    () => batchCostUsd(imgEngine, vidEngine, qty, duration),
    [imgEngine, vidEngine, qty, duration],
  );
  const totalBrl = useMemo(() => usdToBrl(total), [total]);

  async function handleSubmit() {
    if (!modelId || !productId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId, productId, videoCount: qty, durationSeconds: duration, imageEngine: imgEngine, videoEngine: vidEngine }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'Não foi possível criar o lote.');
        return;
      }
      router.push('/batches/' + body.batchId);
    } catch {
      setError('Não foi possível criar o lote. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="lote">
      <div>
        <div className="card step">
          <div className="step-tag">Passo 1</div>
          <h3>Modelo</h3>
          <div className="choices">
            {models.map((m, idx) => (
              <button
                key={m.id}
                type="button"
                className={'choice' + (modelId === m.id ? ' sel' : '')}
                onClick={() => setModelId(m.id)}
              >
                <span
                  className={'dot' + (m.thumb ? '' : ' ' + AV_CLASSES[idx % AV_CLASSES.length])}
                  style={
                    m.thumb
                      ? { backgroundImage: `url(${m.thumb})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                      : undefined
                  }
                />
                <span>
                  <b>{m.name}</b>
                  <small>
                    {m.regionLabel}
                    {m.niche ? ` · ${m.niche}` : ''}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="card step">
          <div className="step-tag">Passo 2</div>
          <h3>Produto</h3>
          {products.length === 0 ? (
            <div className="sub">Nenhum produto cadastrado ainda.</div>
          ) : (
            <div className="choices">
              {products.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={'choice' + (productId === p.id ? ' sel' : '')}
                  onClick={() => setProductId(p.id)}
                >
                  <span
                    className="dot"
                    style={{
                      background: p.thumb ? undefined : 'var(--surface2)',
                      backgroundImage: p.thumb ? `url(${p.thumb})` : undefined,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {!p.thumb && '📦'}
                  </span>
                  <span>
                    <b>{p.title}</b>
                    <small>{p.priceBrl != null ? formatBrl(p.priceBrl) : '—'}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="card step">
          <div className="step-tag">Passo 3</div>
          <h3>Quantidade e duração</h3>
          <div className="qty-row">
            <div className="qty-val">
              <span>{qty}</span> <small>vídeos</small>
            </div>
            <input
              type="range"
              min={1}
              max={40}
              value={qty}
              aria-label="Quantidade de vídeos"
              onChange={(e) => setQty(Number(e.target.value))}
            />
            <div className="seg" role="group" aria-label="Duração">
              <button type="button" className={duration === 5 ? 'on' : ''} onClick={() => setDuration(5)}>
                5 s
              </button>
              <button type="button" className={duration === 10 ? 'on' : ''} onClick={() => setDuration(10)}>
                10 s
              </button>
            </div>
          </div>
        </div>
        <div className="card step">
          <div className="step-tag">Passo 4</div>
          <h3>Motores</h3>
          <div className="sub" style={{ marginBottom: 8 }}>Vídeo · Seedance 2.0</div>
          <div className="choices">
            {VIDEO_ENGINES.map((e) => (
              <button
                key={e.id}
                type="button"
                className={'choice' + (vidEngine === e.id ? ' sel' : '')}
                onClick={() => setVidEngine(e.id)}
              >
                <span>
                  <b>{e.label}</b>
                  <small>{formatUsd(videoCostUsd(e.id, duration))} por vídeo de {duration}s</small>
                </span>
              </button>
            ))}
          </div>
          <div className="sub" style={{ margin: '10px 0 8px' }}>Composição da imagem</div>
          <div className="choices">
            {IMAGE_ENGINES.map((e) => (
              <button
                key={e.id}
                type="button"
                className={'choice' + (imgEngine === e.id ? ' sel' : '')}
                onClick={() => setImgEngine(e.id)}
              >
                <span>
                  <b>{e.label}</b>
                  <small>{formatUsd(imageCostUsd(e.id))} por imagem</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="card cost">
        <h3>Custo estimado do lote</h3>
        <div className="cost-line">
          <span>Vídeo · {videoEngine(vidEngine).label}</span>
          <b>{formatUsd(videoLine)}</b>
        </div>
        <div className="cost-line">
          <span>
            {qty} × {formatUsd(perVideoUsd)} por vídeo
          </span>
          <span></span>
        </div>
        <div className="cost-line">
          <span>Imagens · {imageEngine(imgEngine).label}</span>
          <b>{formatUsd(imageLine)}</b>
        </div>
        <div className="cost-line">
          <span>Roteiros · Claude</span>
          <b>&lt; US$ 0,05</b>
        </div>
        <div className="cost-total">
          <span className="usd">{formatUsd(total)}</span>
          <span className="brl">≈ {formatBrl(totalBrl)}</span>
        </div>
        {error && <div className="alert" style={{ marginTop: 10 }}>{error}</div>}
        <button
          type="button"
          className="btn primary"
          disabled={!modelId || !productId || loading}
          onClick={handleSubmit}
        >
          {loading ? 'Gerando roteiros…' : `Gerar ${qty} roteiros →`}
        </button>
        <div className="cost-note">
          Você ainda revisa os roteiros antes da geração começar. Nada é cobrado até a confirmação final. Valores estimados pela tabela de preços da MuAPI.
        </div>
      </div>
    </div>
  );
}
