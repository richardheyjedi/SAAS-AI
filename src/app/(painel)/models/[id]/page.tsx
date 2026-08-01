import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { PersonaSchema } from '@/types';
import { imageEngine } from '@/lib/engines';
import { approveModel } from '../actions';

type ModelRow = {
  id: string;
  name: string;
  region: string;
  persona: unknown;
  reference_image_urls: string[] | null;
  status: 'generating_refs' | 'pending_approval' | 'approved';
  image_engine: string;
  created_at: string;
};

const REGION_LABEL: Record<string, string> = {
  br: '🇧🇷 Brasileira',
  us: '🇺🇸 Americana',
  us_latina: '🇺🇸 US · Latina',
  custom: 'Personalizada',
};

const STATUS_INFO: Record<ModelRow['status'], { label: string; cls: string }> = {
  generating_refs: { label: 'Gerando referências…', cls: 'p-cyan' },
  pending_approval: { label: 'Revisar e aprovar', cls: 'p-warn' },
  approved: { label: '✓ Pronta para vídeos', cls: 'p-ok' },
};

export default async function ModelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let model: ModelRow | null = null;
  try {
    const supabase = await createServerSupabase();
    const { data } = await supabase.from('models').select('*').eq('id', id).single();
    model = data ?? null;
  } catch {
    model = null;
  }
  if (!model) return notFound();

  const persona = PersonaSchema.safeParse(model.persona);
  const refs = model.reference_image_urls ?? [];
  const status = STATUS_INFO[model.status] ?? { label: model.status, cls: 'p-mut' };
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

      <h2>Character sheet · {refs.length} {refs.length === 1 ? 'referência' : 'referências'}</h2>
      <div className="card" style={{ padding: 16 }}>
        {refs.length === 0 ? (
          <span className="sub">
            {model.status === 'generating_refs'
              ? 'As referências estão sendo geradas — volte em alguns minutos.'
              : 'Nenhuma referência neste modelo.'}
          </span>
        ) : (
          <>
            <div className="refgrid">
              {refs.map((u, i) => (
                <a key={u} href={u} target="_blank" rel="noreferrer" title="Abrir em tamanho real">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt={`${model.name} — referência ${i + 1}`} />
                  {i === 0 && <span className="tag">base da composição</span>}
                </a>
              ))}
            </div>
            <div className="sub" style={{ fontSize: 11.5, marginTop: 10 }}>
              Clique numa imagem para abrir em tamanho real. A 1ª referência é a base usada na composição dos vídeos.
            </div>
          </>
        )}
      </div>

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
