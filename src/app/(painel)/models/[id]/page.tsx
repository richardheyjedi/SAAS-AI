import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { PersonaSchema } from '@/types';
import { imageEngine } from '@/lib/engines';
import { approveModel, promoteModelReference, removeModelReference } from '../actions';
import { ManageRefs } from './ManageRefs';
import { DeleteButton } from '@/app/components/DeleteButton';
import { DuplicateModel, type DuplicateProduct } from '../DuplicateModel';

type ModelRow = {
  id: string;
  name: string;
  region: string;
  persona: unknown;
  reference_image_urls: string[] | null;
  status: 'generating_refs' | 'pending_approval' | 'approved';
  image_engine: string;
  product_id: string | null;
  created_at: string;
  products: { title: string } | { title: string }[] | null;
};

import { MODEL_STATUS_INFO, REGION_LABEL, one } from '@/lib/labels';

export default async function ModelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let model: ModelRow | null = null;
  let pendingRefs = 0;
  let products: DuplicateProduct[] = [];
  try {
    const supabase = await createServerSupabase();
    const [{ data }, { count }, productsRes] = await Promise.all([
      supabase.from('models').select('*,products(title)').eq('id', id).single(),
      supabase.from('image_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('model_id', id).eq('status', 'generating'),
      supabase.from('products').select('id,title').order('created_at', { ascending: false }),
    ]);
    model = data ?? null;
    pendingRefs = count ?? 0;
    products = productsRes.data ?? [];
  } catch {
    model = null;
  }
  if (!model) return notFound();

  const persona = PersonaSchema.safeParse(model.persona);
  const refs = model.reference_image_urls ?? [];
  const status = MODEL_STATUS_INFO[model.status] ?? { label: model.status, cls: 'p-mut' };
  let engineLabel = model.image_engine;
  try {
    engineLabel = imageEngine(model.image_engine).label;
  } catch {
    /* motor removido do registro: mostra o slug cru */
  }
  const createdAt = new Date(model.created_at).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  return (
    <section className="screen on">
      <div className="head">
        <div>
          <h1>{model.name}</h1>
          <div className="sub">
            {REGION_LABEL[model.region] ?? model.region} · motor {engineLabel} · criada em {createdAt}
            {(() => {
              const p = one(model.products);
              return p ? <> · 🛍 produto: <b>{p.title}</b></> : null;
            })()}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className={'pill ' + status.cls}>
            <i></i>
            {status.label}
          </span>
          {model.status === 'pending_approval' && (
            <form action={approveModel.bind(null, model.id)}>
              <button type="submit" className="btn primary">
                Aprovar modelo
              </button>
            </form>
          )}
          {model.status === 'approved' && (
            <Link href="/batches/new" className="btn primary">
              Gerar vídeos com esta modelo →
            </Link>
          )}
          {model.status === 'approved' && (
            <DuplicateModel
              modelId={model.id}
              modelName={model.name}
              currentProductId={model.product_id ?? null}
              products={products}
              variant="button"
              thumbUrl={refs[0] ?? null}
            />
          )}
          <DeleteButton
            url={`/api/models/${model.id}`}
            confirmMessage={`Excluir a modelo "${model.name}" apaga também TODOS os lotes e vídeos gerados com ela. Essa ação não pode ser desfeita. Continuar?`}
            label="🗑 Excluir modelo"
            redirectTo="/models"
          />
          <Link href="/models" className="btn">
            ← Modelos
          </Link>
        </div>
      </div>

      {model.status !== 'approved' && (
        <div className="banner">
          {model.status === 'generating_refs'
            ? '⏳ Esta modelo ainda NÃO está disponível para vídeos: as referências estão sendo geradas. Quando terminarem, ela vai para a sua aprovação.'
            : '⚠ Esta modelo ainda NÃO está disponível para vídeos: revise o character sheet abaixo e clique em "Aprovar modelo" para liberá-la na criação de lotes.'}
        </div>
      )}

      <h2>
        Character sheet · {refs.length} {refs.length === 1 ? 'referência' : 'referências'}
        {pendingRefs > 0 && <span className="pill p-cyan" style={{ marginLeft: 8 }}><i></i>{pendingRefs} em geração…</span>}
      </h2>
      <div className="card" style={{ padding: 16 }}>
        {refs.length === 0 ? (
          <span className="sub">
            {pendingRefs > 0 || model.status === 'generating_refs'
              ? 'As referências estão sendo geradas — volte em alguns minutos.'
              : 'Nenhuma referência neste modelo — adicione fotos ou gere por IA abaixo.'}
          </span>
        ) : (
          <>
            <div className="refgrid">
              {refs.map((u, i) => (
                <div key={u} style={{ display: 'grid', gap: 6 }}>
                  <a href={u} target="_blank" rel="noreferrer" title="Abrir em tamanho real">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt={`${model.name} — referência ${i + 1}`} />
                    {i === 0 && <span className="tag">base da composição</span>}
                  </a>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {i !== 0 && (
                      <form action={promoteModelReference.bind(null, model.id, u)} style={{ flex: 1 }}>
                        <button type="submit" className="btn" style={{ width: '100%', justifyContent: 'center', padding: '4px 8px', fontSize: 11.5 }} title="Usar esta foto como base da composição dos vídeos">
                          ★ Tornar base
                        </button>
                      </form>
                    )}
                    {refs.length > 1 && (
                      <form action={removeModelReference.bind(null, model.id, u)} style={{ flex: i === 0 ? 1 : undefined }}>
                        <button type="submit" className="btn" style={{ width: '100%', justifyContent: 'center', padding: '4px 8px', fontSize: 11.5 }} title="Remover esta referência">
                          × Remover
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="sub" style={{ fontSize: 11.5, marginTop: 10 }}>
              Clique numa imagem para abrir em tamanho real. A ★ base é a foto usada na composição dos vídeos — a última referência não pode ser removida.
            </div>
          </>
        )}
      </div>

      <ManageRefs modelId={model.id} engineId={model.image_engine} />

      <h2>Persona</h2>
      <div className="card" style={{ padding: '6px 16px' }}>
        {!persona.success ? (
          <div className="kv">
            <span className="k">Dados</span>
            <span className="v sub">Persona fora do formato esperado — recrie o modelo se necessário.</span>
          </div>
        ) : (
          <>
            <div className="kv">
              <span className="k">Idade</span>
              <span className="v">{persona.data.age} anos</span>
            </div>
            <div className="kv">
              <span className="k">Nicho</span>
              <span className="v">{persona.data.niche}</span>
            </div>
            <div className="kv">
              <span className="k">Aparência</span>
              <span className="v">{persona.data.appearance}</span>
            </div>
            <div className="kv">
              <span className="k">Personalidade</span>
              <span className="v">{persona.data.personality}</span>
            </div>
            <div className="kv">
              <span className="k">Estilo de fala</span>
              <span className="v">{persona.data.speech_style}</span>
            </div>
            <div className="kv">
              <span className="k">Prompt de imagem (usado nas gerações)</span>
              <span className="v mono">{persona.data.image_prompt}</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
