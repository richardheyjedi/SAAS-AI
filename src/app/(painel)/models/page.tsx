import { createServerSupabase } from '@/lib/supabase/server';
import { PersonaSchema } from '@/types';
import { ModelForm } from './ModelForm';
import { approveModel } from './actions';
import { CharacterSheetGuide } from './CharacterSheetGuide';

type ModelRow = {
  id: string;
  name: string;
  region: string;
  persona: unknown;
  reference_image_urls: string[] | null;
  status: 'generating_refs' | 'pending_approval' | 'approved';
  created_at: string;
};

const REGION_LABEL: Record<string, string> = {
  br: '🇧🇷 Brasileira',
  us: '🇺🇸 Americana',
  us_latina: '🇺🇸 US · Latina',
  custom: 'Personalizada',
};

const STATUS_INFO: Record<ModelRow['status'], { label: string; cls: string }> = {
  generating_refs: { label: 'Gerando referências', cls: 'p-cyan' },
  pending_approval: { label: 'Aguardando aprovação', cls: 'p-warn' },
  approved: { label: 'Aprovada', cls: 'p-ok' },
};

export default async function ModelsPage() {
  let models: ModelRow[] = [];
  try {
    const supabase = await createServerSupabase();
    const { data } = await supabase.from('models').select('*').order('created_at', { ascending: false });
    models = data ?? [];
  } catch {
    models = [];
  }

  return (
    <section className="screen on">
      <div className="head">
        <div>
          <h1>Modelos</h1>
          <div className="sub">
            Creators virtuais com imagens de referência fixas — é o que mantém o mesmo rosto em todos os vídeos
          </div>
        </div>
      </div>
      {models.length === 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 14, display: 'grid', gap: 10 }}>
          <b>Nenhum modelo ainda</b>
          <span className="sub">
            Crie sua primeira creator virtual: anexe fotos suas de referência, gere por IA a partir de um prompt, ou combine os dois.
          </span>
          <CharacterSheetGuide startOpen />
        </div>
      )}
      <div className="grid3">
        {models.map((m) => {
          const persona = PersonaSchema.safeParse(m.persona);
          const niche = persona.success ? persona.data.niche : null;
          const refCount = m.reference_image_urls?.length ?? 0;
          const status = STATUS_INFO[m.status] ?? { label: m.status, cls: 'p-mut' };
          return (
            <div className="card" key={m.id}>
              {(() => {
                const refs = (m.reference_image_urls ?? []).slice(0, 4);
                return (
                  <div className={'avatar' + (refs.length ? '' : ' av-1')} style={{ position: 'relative' }}>
                    {refs.length > 0 && (
                      <div
                        style={{
                          position: 'absolute', inset: 0, display: 'grid', gap: 2,
                          gridTemplateColumns: refs.length > 1 ? '1fr 1fr' : '1fr',
                          gridTemplateRows: refs.length > 2 ? '1fr 1fr' : '1fr',
                        }}
                      >
                        {refs.map((u) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={u} src={u} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ))}
                      </div>
                    )}
                    <span className="pill" style={{ position: 'absolute' }}>{REGION_LABEL[m.region] ?? m.region}</span>
                  </div>
                );
              })()}
              <div className="card-body">
                <b>{m.name}</b>
                <div className="d">{niche ? `nicho ${niche}` : '—'}</div>
              </div>
              <div className="card-foot">
                <span>{refCount} refs</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={'pill ' + status.cls}>
                    <i></i>
                    {status.label}
                  </span>
                  {m.status === 'pending_approval' && (
                    <form action={approveModel.bind(null, m.id)}>
                      <button type="submit" className="btn" style={{ padding: '3px 10px', fontSize: 12 }}>
                        Aprovar
                      </button>
                    </form>
                  )}
                </span>
              </div>
            </div>
          );
        })}
        <ModelForm />
      </div>
    </section>
  );
}
