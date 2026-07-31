# Plano de Implementação: Referências próprias + UX de Modelos + guia de character sheet

> **Para quem for executar:** SUB-SKILL OBRIGATÓRIA: use a skill `jet-subagentes` para implementar este plano tarefa por tarefa, com um agente `jet-implementador` por tarefa e revisão via `jet-revisor` entre tarefas. Passos usam sintaxe de checkbox (`- [ ]`) para rastreamento.

**Objetivo:** Permitir anexar fotos de referência próprias na criação de modelo (upload direto ao Supabase Storage), com controle de 0–5 refs geradas por IA, guia de character sheet na UI e cards/empty state melhorados na página de Modelos.

**Arquitetura:** Upload client-side via `createBrowserSupabase()` para o bucket público `model-refs` (migração 0003); a rota `/api/models/generate` aceita `referenceUrls` e grava as anexadas primeiro em `reference_image_urls` (posição [0] é a base da composição); só anexadas → modelo nasce `pending_approval` sem custo MuAPI. O guia de character sheet vira componente compartilhado entre o formulário e o empty state.

**Stack técnica:** Next.js 15 (App Router), TypeScript, Zod, Supabase (Storage + Postgres), Vitest.

**Spec:** `docs/aios-jet/specs/2026-07-31-refs-proprias-design.md`

## Restrições globais

- Repo: `C:\Users\richa\AutoReelsAI` (Windows; comandos a partir da raiz).
- Bucket: `model-refs`, leitura pública, INSERT só `authenticated`. Tipos aceitos: jpg/jpeg/png/webp; ≤ 8 MB/arquivo; máximo 10 fotos anexadas.
- Regra de validação: `refCount > 0 || referenceUrls.length > 0` (mensagem exata: "O modelo precisa de pelo menos uma referência (anexada ou gerada por IA)").
- Anexadas SEMPRE primeiro no array `reference_image_urls`; persona via Claude gerada SEMPRE.
- `refCount === 0` → status inicial `pending_approval` e NENHUMA chamada MuAPI.
- Toda tarefa termina com `npx vitest run` verde e `npx tsc --noEmit` exit 0.
- Commits em português com `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- NÃO tocar: cron, webhook, middleware, BatchForm, engines/cost/muapi libs.

---

### Tarefa 1: Migração 0003 + schema/rota com referências próprias

**Arquivos:**
- Criar: `supabase/migrations/0003_model_refs_bucket.sql`
- Modificar: `src/app/api/models/generate/schema.ts`
- Modificar: `src/app/api/models/generate/route.ts`
- Teste: `tests/schemas.test.ts` (casos novos no describe existente)

**Interfaces:**
- Consome: `ModelGenerateBodySchema` existente; rota existente.
- Produz (T2 depende): body aceita `referenceUrls: string[]` (default `[]`) e `refCount` 0–5; rota grava `reference_image_urls` e decide status.

- [ ] **Passo 1: Criar a migração**

Criar `supabase/migrations/0003_model_refs_bucket.sql`:

```sql
insert into storage.buckets (id, name, public) values ('model-refs', 'model-refs', true)
on conflict (id) do nothing;

create policy "authenticated upload model-refs"
on storage.objects for insert to authenticated
with check (bucket_id = 'model-refs');
```

(Aplicação manual pelo controlador; você só cria o arquivo.)

- [ ] **Passo 2: Testes novos (vão falhar)**

Em `tests/schemas.test.ts`, dentro do `describe('ModelGenerateBodySchema', ...)` existente, ADICIONAR:

```ts
  it('aceita refCount 0 quando há referências anexadas', () => {
    const p = ModelGenerateBodySchema.parse({
      region: 'br', refCount: 0, referenceUrls: ['https://cdn/x.jpg'],
    });
    expect(p.refCount).toBe(0);
    expect(p.referenceUrls).toEqual(['https://cdn/x.jpg']);
  });
  it('rejeita refCount 0 sem nenhuma referência', () => {
    const r = ModelGenerateBodySchema.safeParse({ region: 'br', refCount: 0 });
    expect(r.success).toBe(false);
  });
  it('rejeita URL inválida e mais de 10 URLs', () => {
    expect(ModelGenerateBodySchema.safeParse({ region: 'br', referenceUrls: ['nao-e-url'] }).success).toBe(false);
    const many = Array.from({ length: 11 }, (_, i) => `https://cdn/${i}.jpg`);
    expect(ModelGenerateBodySchema.safeParse({ region: 'br', referenceUrls: many }).success).toBe(false);
  });
  it('default de referenceUrls é lista vazia', () => {
    expect(ModelGenerateBodySchema.parse({ region: 'br' }).referenceUrls).toEqual([]);
  });
```

- [ ] **Passo 3: Rodar para confirmar que falha**

Rodar: `npx vitest run tests/schemas.test.ts` → FAIL (campo não existe / refCount min 1).

- [ ] **Passo 4: Atualizar o schema**

Substituir o conteúdo de `src/app/api/models/generate/schema.ts` por:

```ts
import { z } from 'zod';
import { RegionSchema } from '@/types';
import { DEFAULT_IMAGE_ENGINE, IMAGE_ENGINE_IDS } from '@/lib/engines';

export const ModelGenerateBodySchema = z
  .object({
    region: RegionSchema,
    customPrompt: z.string().max(2000).optional(),
    refCount: z.number().int().min(0).max(5).default(3),
    imageEngine: z.enum(IMAGE_ENGINE_IDS).default(DEFAULT_IMAGE_ENGINE),
    referenceUrls: z.array(z.string().url()).max(10).default([]),
  })
  .refine((d) => d.refCount > 0 || d.referenceUrls.length > 0, {
    message: 'O modelo precisa de pelo menos uma referência (anexada ou gerada por IA)',
  });
```

- [ ] **Passo 5: Atualizar a rota**

Em `src/app/api/models/generate/route.ts`:

1. O destructuring vira:

```ts
  const { region, customPrompt, refCount, imageEngine, referenceUrls } = parsed.data;
```

2. O insert do modelo vira (anexadas primeiro; status decidido pelo refCount):

```ts
  const persona = await generatePersona({ region, customPrompt });
  const { data: model, error } = await supabase
    .from('models')
    .insert({
      name: persona.name,
      region,
      persona,
      status: refCount > 0 ? 'generating_refs' : 'pending_approval',
      image_engine: imageEngine,
      reference_image_urls: referenceUrls,
    })
    .select('id').single();
```

3. O loop de geração permanece exatamente como está (`for (let i = 0; i < refCount; i++)` — com refCount 0 ele não roda e nenhuma chamada MuAPI acontece).

- [ ] **Passo 6: Rodar suíte completa + type-check**

Rodar: `npx vitest run` → PASS · `npx tsc --noEmit` → exit 0

- [ ] **Passo 7: Commit**

```bash
git add supabase/migrations/0003_model_refs_bucket.sql src/app/api/models/generate/schema.ts src/app/api/models/generate/route.ts tests/schemas.test.ts
git commit -m "feat: modelo aceita referencias proprias (refCount 0-5 + referenceUrls)"
```

---

### Tarefa 2: Guia de character sheet + formulário de criação com upload

**Arquivos:**
- Criar: `src/app/(painel)/models/CharacterSheetGuide.tsx`
- Modificar: `src/app/(painel)/models/ModelForm.tsx` (substituição completa)

**Interfaces:**
- Consome: body da rota da T1 (`referenceUrls`, `refCount` 0–5); `createBrowserSupabase()` de `@/lib/supabase/browser`; `IMAGE_ENGINES`, `DEFAULT_IMAGE_ENGINE` de `@/lib/engines`; `imageCostUsd`, `modelRefsCostUsd` de `@/lib/cost`; bucket `model-refs` (T1).
- Produz (T3 depende): componente `CharacterSheetGuide` (sem props, sem hooks — utilizável em server component).

- [ ] **Passo 1: Criar o guia compartilhado**

Criar `src/app/(painel)/models/CharacterSheetGuide.tsx`:

```tsx
// Guia canônico de character sheet (spec 2026-07-31-refs-proprias §5).
// Sem hooks: usável tanto no formulário (client) quanto no empty state (server).
export function CharacterSheetGuide({ startOpen = false }: { startOpen?: boolean }) {
  return (
    <details open={startOpen} style={{ borderRadius: 10, background: 'var(--surface2, rgba(255,255,255,0.04))', padding: '10px 12px' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
        📸 Como montar um character sheet consistente
      </summary>
      <ul className="sub" style={{ margin: '10px 0 0', paddingLeft: 18, display: 'grid', gap: 6, fontSize: 12.5 }}>
        <li>Use <b>3 a 5 fotos da MESMA pessoa</b> — misturar pessoas quebra a consistência.</li>
        <li>Inclua: <b>rosto de frente bem nítido</b>, <b>perfil ou 3/4</b> e <b>corpo inteiro</b>.</li>
        <li><b>Mesma aparência em todas</b>: cabelo, maquiagem e roupa iguais entre as fotos.</li>
        <li><b>Fundo neutro e luz uniforme</b> — evite sombras duras e contraluz.</li>
        <li><b>Sem filtros, óculos escuros ou chapéu</b> — nada que esconda traços do rosto.</li>
        <li>Resolução mínima ~720p; rosto ocupando boa parte do quadro na foto principal.</li>
        <li><b>A 1ª foto é a base da composição dos vídeos</b> — deixe a melhor em primeiro.</li>
        <li>Para referências geradas por IA: fixe os traços no prompt personalizado (cor e corte de cabelo, cor dos olhos, tom de pele, marcas) — quanto mais específico, mais consistente.</li>
      </ul>
    </details>
  );
}
```

- [ ] **Passo 2: Reescrever o `ModelForm.tsx`**

Substituir TODO o conteúdo de `src/app/(painel)/models/ModelForm.tsx` por:

```tsx
'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { DEFAULT_IMAGE_ENGINE, IMAGE_ENGINES } from '@/lib/engines';
import { imageCostUsd, modelRefsCostUsd } from '@/lib/cost';
import { CharacterSheetGuide } from './CharacterSheetGuide';

const REGIONS: { value: string; label: string }[] = [
  { value: 'br', label: '🇧🇷 Brasileira' },
  { value: 'us', label: '🇺🇸 Americana' },
  { value: 'us_latina', label: '🇺🇸 US · Latina' },
  { value: 'custom', label: 'Personalizada' },
];

const ACCEPTED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_FILE_MB = 8;
const MAX_ATTACHED = 10;
const AI_REF_OPTIONS = [0, 1, 2, 3, 4, 5];

export function ModelForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [region, setRegion] = useState('br');
  const [customPrompt, setCustomPrompt] = useState('');
  const [engine, setEngine] = useState(DEFAULT_IMAGE_ENGINE);
  const [refCount, setRefCount] = useState(3);
  const [refUrls, setRefUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalRefs = refUrls.length + refCount;

  async function handleFiles(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    const files = Array.from(list);
    for (const f of files) {
      if (!ACCEPTED_TYPES[f.type]) {
        setError(`Formato não suportado: ${f.name} — use JPG, PNG ou WebP.`);
        return;
      }
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        setError(`${f.name} passa de ${MAX_FILE_MB} MB.`);
        return;
      }
    }
    if (refUrls.length + files.length > MAX_ATTACHED) {
      setError(`Máximo de ${MAX_ATTACHED} fotos anexadas.`);
      return;
    }
    setUploading(true);
    try {
      const supabase = createBrowserSupabase();
      const uploaded: string[] = [];
      for (const f of files) {
        const path = `${crypto.randomUUID()}.${ACCEPTED_TYPES[f.type]}`;
        const { error: upErr } = await supabase.storage.from('model-refs').upload(path, f);
        if (upErr) throw upErr;
        uploaded.push(supabase.storage.from('model-refs').getPublicUrl(path).data.publicUrl);
      }
      setRefUrls((prev) => [...prev, ...uploaded]);
    } catch {
      setError('Falha no upload. Verifique a conexão e tente de novo.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (totalRefs === 0) {
      setError('Anexe pelo menos uma foto ou gere referências por IA.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/models/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region,
          customPrompt: customPrompt || undefined,
          imageEngine: engine,
          refCount,
          referenceUrls: refUrls,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'Não foi possível criar o modelo.');
        return;
      }
      setOpen(false);
      setCustomPrompt('');
      setRefUrls([]);
      setRefCount(3);
      router.refresh();
    } catch {
      setError('Não foi possível criar o modelo. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button className="new-card" onClick={() => setOpen(true)} type="button">
        <span className="plus">+</span>
        <b>Criar modelo</b>
        <span>com suas fotos, por IA, ou os dois</span>
      </button>
    );
  }

  return (
    <div className="card" style={{ padding: 16, display: 'grid', gap: 12 }}>
      <b>Criar modelo</b>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span className="sub">Região</span>
          <select
            className="btn"
            style={{ fontWeight: 400, width: '100%' }}
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          >
            {REGIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span className="sub">Prompt personalizado (opcional)</span>
          <textarea
            className="btn"
            style={{ fontWeight: 400, width: '100%', minHeight: 70, textAlign: 'left' }}
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="Descreva a persona desejada…"
          />
        </label>

        <div style={{ display: 'grid', gap: 6 }}>
          <span className="sub">Suas referências ({refUrls.length}/{MAX_ATTACHED})</span>
          {refUrls.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
              {refUrls.map((u, i) => (
                <span key={u} style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt={`Referência ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  {i === 0 && (
                    <span style={{ position: 'absolute', left: 2, bottom: 2, fontSize: 9, background: 'rgba(0,0,0,0.65)', color: '#fff', borderRadius: 4, padding: '1px 4px' }}>
                      base
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label={`Remover referência ${i + 1}`}
                    onClick={() => setRefUrls((prev) => prev.filter((x) => x !== u))}
                    style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: 9, border: 'none', cursor: 'pointer', background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 11, lineHeight: '18px', padding: 0 }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button type="button" className="btn" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? 'Enviando fotos…' : '+ Anexar fotos (JPG/PNG/WebP, até 8 MB)'}
          </button>
        </div>

        <div style={{ display: 'grid', gap: 4 }}>
          <span className="sub">Referências geradas por IA</span>
          <div className="seg" role="group" aria-label="Quantidade de referências por IA" style={{ display: 'flex' }}>
            {AI_REF_OPTIONS.map((n) => (
              <button key={n} type="button" className={refCount === n ? 'on' : ''} onClick={() => setRefCount(n)}>
                {n}
              </button>
            ))}
          </div>
          <span className="sub" style={{ fontSize: 11.5 }}>
            {refCount === 0
              ? 'Nenhuma — só as suas fotos (custo US$ 0,00)'
              : `${refCount} imagem(ns) ≈ US$ ${modelRefsCostUsd(engine, refCount).toFixed(2).replace('.', ',')} (estimativa)`}
          </span>
        </div>

        <label style={{ display: 'grid', gap: 4 }}>
          <span className="sub">Motor de imagem</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {IMAGE_ENGINES.map((e) => (
              <button
                key={e.id}
                type="button"
                className={'btn' + (engine === e.id ? ' primary' : '')}
                style={{ flex: 1, fontWeight: 400 }}
                onClick={() => setEngine(e.id)}
              >
                {e.label}
                <small style={{ display: 'block' }}>
                  US$ {imageCostUsd(e.id).toFixed(2).replace('.', ',')}/imagem
                </small>
              </button>
            ))}
          </div>
        </label>

        <CharacterSheetGuide />

        {error && <div className="pill p-err">{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="btn primary" disabled={loading || uploading || totalRefs === 0}>
            {loading ? 'Criando modelo…' : 'Criar modelo'}
          </button>
          <button type="button" className="btn" onClick={() => setOpen(false)} disabled={loading}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Passo 3: Rodar suíte + type-check**

Rodar: `npx vitest run` → PASS · `npx tsc --noEmit` → exit 0

- [ ] **Passo 4: Commit**

```bash
git add "src/app/(painel)/models/CharacterSheetGuide.tsx" "src/app/(painel)/models/ModelForm.tsx"
git commit -m "feat: upload de referencias proprias + guia de character sheet no formulario"
```

---

### Tarefa 3: Página de Modelos — cards com mini-grade e empty state

**Arquivos:**
- Modificar: `src/app/(painel)/models/page.tsx`

**Interfaces:**
- Consome: `CharacterSheetGuide` (T2 — sem hooks, seguro em server component).
- Produz: nada (folha).

- [ ] **Passo 1: Atualizar a página**

Em `src/app/(painel)/models/page.tsx`:

1. Adicionar o import:

```tsx
import { CharacterSheetGuide } from './CharacterSheetGuide';
```

2. Substituir o bloco do avatar do card (o `<div className={'avatar' ...}>` com a `<img>` única) por uma mini-grade com até 4 referências:

```tsx
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
```

(O restante do card — corpo, rodapé, botão Aprovar — permanece intocado.)

3. Logo após o `<div className="head">…</div>` e antes do `<div className="grid3">`, adicionar o empty state:

```tsx
      {models.length === 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 14, display: 'grid', gap: 10 }}>
          <b>Nenhum modelo ainda</b>
          <span className="sub">
            Crie sua primeira creator virtual: anexe fotos suas de referência, gere por IA a partir de um prompt, ou combine os dois.
          </span>
          <CharacterSheetGuide startOpen />
        </div>
      )}
```

- [ ] **Passo 2: Rodar suíte + type-check + build**

Rodar: `npx vitest run` → PASS · `npx tsc --noEmit` → exit 0
Rodar: `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue` e `npm run build` → exit 0

- [ ] **Passo 3: Commit**

```bash
git add "src/app/(painel)/models/page.tsx"
git commit -m "feat: cards de modelo com mini-grade de refs e empty state com guia"
```

---

## Pendências operacionais (controlador, fora do código)

1. Aplicar `supabase/migrations/0003_model_refs_bucket.sql` no SQL Editor (clipboard).
2. Revisão final da branch + `git push` + deploy Vercel (`npx vercel --prod --yes`).
3. Verificação visual do upload no navegador (produção ou dev).
