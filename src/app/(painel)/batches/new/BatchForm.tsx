'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { batchCostUsd, imageCostUsd, usdToBrl, videoCostUsd } from '@/lib/cost';
import {
  DEFAULT_IMAGE_ENGINE, DEFAULT_VIDEO_ENGINE, IMAGE_ENGINES, VIDEO_ENGINES,
  VIDEO_ASPECT_RATIOS, VIDEO_DURATION_MAX, VIDEO_DURATION_MIN,
  imageEngine, videoEngine,
} from '@/lib/engines';

export type BatchModel = {
  id: string;
  name: string;
  region: string;
  regionLabel: string;
  niche: string;
  thumb: string | null;
  productId: string | null;
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
  const [duration, setDuration] = useState(5);
  const [imgEngine, setImgEngine] = useState(DEFAULT_IMAGE_ENGINE);
  const [vidEngine, setVidEngine] = useState(DEFAULT_VIDEO_ENGINE);
  const [audio, setAudio] = useState(true);
  const [highBitrate, setHighBitrate] = useState(false);
  const [aspect, setAspect] = useState<string>('9:16');
  const [resolution, setResolution] = useState<'480p' | '720p'>('720p');
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
        body: JSON.stringify({
          modelId, productId, videoCount: qty, durationSeconds: duration,
          imageEngine: imgEngine, videoEngine: vidEngine,
          generateAudio: audio, highBitrate, aspectRatio: aspect, resolution,
        }),
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
                onClick={() => {
                  setModelId(m.id);
                  // Modelo com produto vinculado pré-seleciona o par certo.
                  if (m.productId && products.some((p) => p.id === m.productId)) {
                    setProductId(m.productId);
                  }
                }}
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
          <h3>Quantidade, duração e controles</h3>
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
          </div>
          <div className="qty-row" style={{ marginTop: 10 }}>
            <div className="qty-val">
              <span>{duration}</span> <small>seg/vídeo</small>
            </div>
            <input
              type="range"
              min={VIDEO_DURATION_MIN}
              max={VIDEO_DURATION_MAX}
              value={duration}
              aria-label="Duração de cada vídeo em segundos"
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 14, alignItems: 'center' }}>
            <div className="lbl">
              <span className="sub">Formato</span>
              <div className="seg" role="group" aria-label="Formato do vídeo">
                {VIDEO_ASPECT_RATIOS.map((r) => (
                  <button key={r} type="button" className={aspect === r ? 'on' : ''} onClick={() => setAspect(r)}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            {videoEngine(vidEngine).supportsAudio && (
              <div className="lbl">
                <span className="sub">Som (gerado pela IA)</span>
                <div className="seg" role="group" aria-label="Som do vídeo">
                  <button type="button" className={audio ? 'on' : ''} onClick={() => setAudio(true)}>
                    🔊 Com som
                  </button>
                  <button type="button" className={!audio ? 'on' : ''} onClick={() => setAudio(false)}>
                    🔇 Sem som
                  </button>
                </div>
              </div>
            )}
            {videoEngine(vidEngine).supportsResolution && (
              <div className="lbl">
                <span className="sub">Resolução</span>
                <div className="seg" role="group" aria-label="Resolução">
                  <button type="button" className={resolution === '720p' ? 'on' : ''} onClick={() => setResolution('720p')}>
                    720p
                  </button>
                  <button type="button" className={resolution === '480p' ? 'on' : ''} onClick={() => setResolution('480p')}>
                    480p
                  </button>
                </div>
              </div>
            )}
            {videoEngine(vidEngine).supportsHighBitrate && (
              <div className="lbl">
                <span className="sub">Fidelidade visual</span>
                <div className="seg" role="group" aria-label="Bitrate">
                  <button type="button" className={!highBitrate ? 'on' : ''} onClick={() => setHighBitrate(false)}>
                    Normal
                  </button>
                  <button type="button" className={highBitrate ? 'on' : ''} onClick={() => setHighBitrate(true)}>
                    Alta (arquivo maior)
                  </button>
                </div>
              </div>
            )}
          </div>
          {!videoEngine(vidEngine).supportsAudio && (
            <div className="sub" style={{ fontSize: 11.5, marginTop: 10 }}>
              O tier selecionado não expõe controle de som na API — para escolher com/sem som, use o Seedance 2.0 Mini.
            </div>
          )}
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
