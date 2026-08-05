# Plano de Implementação: Duplicar modelo trocando o produto

> **Para quem for executar:** SUB-SKILL OBRIGATÓRIA: use a skill `jet-subagentes` para implementar este plano tarefa por tarefa, com um agente `jet-implementador` por tarefa e revisão via `jet-revisor` entre tarefas. Passos usam sintaxe de checkbox (`- [ ]`) para rastreamento.

**Objetivo:** Duplicar uma modelo aprovada mantendo o mesmo rosto (mesmas `reference_image_urls`) e trocando apenas o produto associado, a custo US$ 0.

**Arquitetura:** Nova rota `POST /api/models/[id]/duplicate` (schema Zod em arquivo separado, insert único na tabela `models`) + um componente client `DuplicateModel.tsx` com modal, plugado na página de detalhe da modelo e no card da listagem. Nenhuma migração de banco.

**Stack técnica:** Next.js 15 (App Router, route handlers com `params: Promise`), React 19, Supabase (`createServerSupabase`), Zod 3, Vitest 3.

**Spec de referência:** `docs/aios-jet/specs/2026-08-05-duplicar-modelo-design.md` (leia antes de começar).

## Restrições globais

- Projeto em `C:\Users\richa\AutoReelsAI`. Todos os caminhos abaixo são relativos a essa raiz.
- Persona copiada **idêntica** — nenhuma chamada a Claude ou MuAPI em lugar nenhum desta feature.
- Só modelos com `status === 'approved'` podem ser duplicadas; a cópia nasce com `status: 'approved'`.
- Nome default da cópia: `"<nome original> (2)"`. Nome duplicado não é bloqueado.
- `image_jobs` NÃO são copiados; `reference_image_urls` são as mesmas URLs (sem cópia física no bucket).
- Textos de UI em pt-BR, exatamente como escritos nas tarefas (copy do spec).
- Mensagens de erro da API: 401 `"Não autenticado"`, 404 `"Modelo não encontrado"` / `"Produto não encontrado — atualize a página."`, 409 `"Só modelos aprovadas podem ser duplicadas."`.
- Comandos de verificação: `npm test` (Vitest) e `npx tsc --noEmit` (typecheck). Rodar sempre a partir da raiz do projeto.

---

### Tarefa 1: Schema Zod do body de duplicação (TDD)

**Arquivos:**
- Criar: `src/app/api/models/[id]/duplicate/schema.ts`
- Modificar: `tests/schemas.test.ts` (adicionar um `describe` no final do arquivo)

**Interfaces:**
- Consome: nada de tarefas anteriores.
- Produz: `DuplicateBodySchema` — Zod object com `productId: string` (uuid, obrigatório) e `name?: string` (trim aplicado; string vazia/só espaços vira `undefined`; máx. 120 chars). A Tarefa 2 importa `DuplicateBodySchema` de `./schema`.

- [ ] **Passo 1: Escrever o teste que falha**

Adicionar ao FINAL de `tests/schemas.test.ts` (depois do `describe('NewRefsBodySchema', ...)`), junto com o import no topo do arquivo:

```ts
// no topo, junto aos outros imports:
import { DuplicateBodySchema } from '@/app/api/models/[id]/duplicate/schema';

// no final do arquivo:
describe('DuplicateBodySchema', () => {
  it('exige productId uuid', () => {
    expect(DuplicateBodySchema.safeParse({}).success).toBe(false);
    expect(DuplicateBodySchema.safeParse({ productId: 'nao-uuid' }).success).toBe(false);
    expect(DuplicateBodySchema.parse({ productId: uuid }).productId).toBe(uuid);
  });
  it('name é opcional, sofre trim e vazio vira undefined (default aplicado na rota)', () => {
    expect(DuplicateBodySchema.parse({ productId: uuid }).name).toBeUndefined();
    expect(DuplicateBodySchema.parse({ productId: uuid, name: '  Larissa (2)  ' }).name).toBe('Larissa (2)');
    expect(DuplicateBodySchema.parse({ productId: uuid, name: '   ' }).name).toBeUndefined();
  });
  it('rejeita name acima de 120 caracteres', () => {
    expect(DuplicateBodySchema.safeParse({ productId: uuid, name: 'x'.repeat(121) }).success).toBe(false);
  });
});
```

(A constante `uuid` já existe no topo do arquivo de teste.)

- [ ] **Passo 2: Rodar o teste para confirmar que falha**

Rodar: `npm test`
Esperado: FAIL — erro de import (`Cannot find module '@/app/api/models/[id]/duplicate/schema'` ou equivalente do Vite).

- [ ] **Passo 3: Escrever a implementação mínima**

Criar `src/app/api/models/[id]/duplicate/schema.ts`:

```ts
import { z } from 'zod';

export const DuplicateBodySchema = z.object({
  productId: z.string().uuid(),
  name: z.string().trim().max(120).optional().transform((v) => (v ? v : undefined)),
});
```

- [ ] **Passo 4: Rodar os testes para confirmar que passam**

Rodar: `npm test`
Esperado: PASS — todos os testes do arquivo, incluindo os 3 novos.

- [ ] **Passo 5: Commit**

```bash
git add "src/app/api/models/[id]/duplicate/schema.ts" tests/schemas.test.ts
git commit -m "feat: schema do body de duplicacao de modelo"
```

---

### Tarefa 2: Rota `POST /api/models/[id]/duplicate`

**Arquivos:**
- Criar: `src/app/api/models/[id]/duplicate/route.ts`

**Interfaces:**
- Consome: `DuplicateBodySchema` de `./schema` (Tarefa 1); `createServerSupabase` de `@/lib/supabase/server` (já existe).
- Produz: endpoint `POST /api/models/<id>/duplicate` — body `{ productId, name? }`, sucesso `201 { modelId: string }`, erros `401 | 400 (flatten) | 404 | 409 | 500` conforme Restrições globais. A Tarefa 3 chama esse endpoint via `fetch`.

Não há infraestrutura de teste de route handlers no projeto (testes cobrem apenas `lib/` e schemas — mantenha assim, não invente mock de Supabase). O gate desta tarefa é o typecheck + a suíte existente continuar verde.

- [ ] **Passo 1: Escrever a rota completa**

Criar `src/app/api/models/[id]/duplicate/route.ts` (mesmo estilo de `src/app/api/products/[id]/route.ts`):

```ts
import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { DuplicateBodySchema } from './schema';

/**
 * Duplica uma modelo aprovada trocando o produto: mesma persona e mesmas
 * referências (URLs compartilhadas — remoção de ref nunca apaga do bucket),
 * custo zero. A cópia nasce 'approved'; image_jobs não são copiados.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const parsed = DuplicateBodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { productId, name } = parsed.data;

  const { data: original } = await supabase
    .from('models')
    .select('name,region,persona,reference_image_urls,image_engine,status')
    .eq('id', id)
    .single();
  if (!original) return NextResponse.json({ error: 'Modelo não encontrado' }, { status: 404 });
  if (original.status !== 'approved') {
    return NextResponse.json({ error: 'Só modelos aprovadas podem ser duplicadas.' }, { status: 409 });
  }

  const { data: product } = await supabase.from('products').select('id').eq('id', productId).single();
  if (!product) {
    return NextResponse.json({ error: 'Produto não encontrado — atualize a página.' }, { status: 404 });
  }

  const { data: copy, error } = await supabase
    .from('models')
    .insert({
      name: name ?? `${original.name} (2)`,
      region: original.region,
      persona: original.persona,
      reference_image_urls: original.reference_image_urls ?? [],
      image_engine: original.image_engine,
      status: 'approved',
      product_id: productId,
    })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ modelId: copy.id }, { status: 201 });
}
```

- [ ] **Passo 2: Typecheck e suíte**

Rodar: `npx tsc --noEmit`
Esperado: sem erros.
Rodar: `npm test`
Esperado: PASS (nada desta tarefa quebra os testes existentes).

- [ ] **Passo 3: Commit**

```bash
git add "src/app/api/models/[id]/duplicate/route.ts"
git commit -m "feat: rota POST /api/models/[id]/duplicate"
```

---

### Tarefa 3: Componente `DuplicateModel` (botão + modal)

**Arquivos:**
- Criar: `src/app/(painel)/models/DuplicateModel.tsx`

**Interfaces:**
- Consome: endpoint `POST /api/models/<id>/duplicate` (Tarefa 2); componente `Modal` de `@/app/components/Modal` (já existe, props `title/onClose/busy/maxWidth`).
- Produz: `DuplicateModel` — client component com props exatas:
  `{ modelId: string; modelName: string; currentProductId: string | null; products: DuplicateProduct[]; variant: 'button' | 'cardAction'; thumbUrl: string | null }`
  e o tipo exportado `DuplicateProduct = { id: string; title: string }`. A Tarefa 4 importa ambos.

- [ ] **Passo 1: Escrever o componente completo**

Criar `src/app/(painel)/models/DuplicateModel.tsx` (mesmo esqueleto de `src/app/(painel)/products/EditProduct.tsx` — fetch, erro em `.alert`, loading nos botões):

```tsx
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
```

- [ ] **Passo 2: Typecheck**

Rodar: `npx tsc --noEmit`
Esperado: sem erros.

- [ ] **Passo 3: Commit**

```bash
git add "src/app/(painel)/models/DuplicateModel.tsx"
git commit -m "feat: componente DuplicateModel (modal de duplicacao)"
```

---

### Tarefa 4: Integração nas páginas (listagem + detalhe)

**Arquivos:**
- Modificar: `src/app/(painel)/models/page.tsx` (tipo `ModelRow`, rodapé do card ~linhas 91-106)
- Modificar: `src/app/(painel)/models/[id]/page.tsx` (tipo `ModelRow`, fetch de produtos ~linhas 28-40, grupo de ações do cabeçalho ~linhas 69-95)

**Interfaces:**
- Consome: `DuplicateModel` e `DuplicateProduct` de Tarefa 3.
- Produz: feature visível ao usuário; nada consome esta tarefa.

- [ ] **Passo 1: Listagem — expor `product_id` e plugar a ação no card**

Em `src/app/(painel)/models/page.tsx`:

(a) Adicionar o import junto aos demais:

```tsx
import { DuplicateModel } from './DuplicateModel';
```

(b) Adicionar `product_id` ao tipo `ModelRow` (o `select('*')` já o traz):

```tsx
type ModelRow = {
  id: string;
  name: string;
  region: string;
  persona: unknown;
  reference_image_urls: string[] | null;
  status: 'generating_refs' | 'pending_approval' | 'approved';
  product_id: string | null;
  created_at: string;
};
```

(c) No `card-foot`, trocar `<span>{refCount} refs</span>` por um span flex com a ação (só para aprovadas — nos demais status fica só o contador, como hoje):

```tsx
<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
  {refCount} refs
  {m.status === 'approved' && (
    <DuplicateModel
      modelId={m.id}
      modelName={m.name}
      currentProductId={m.product_id ?? null}
      products={products}
      variant="cardAction"
      thumbUrl={m.reference_image_urls?.[0] ?? null}
    />
  )}
</span>
```

(A variável `products` já existe na página — é o mesmo `select('id,title')` que alimenta o `ModelForm`. O `card-foot` fica FORA do `<Link>` do card, então o clique não navega.)

- [ ] **Passo 2: Detalhe — buscar produtos e plugar o botão no cabeçalho**

Em `src/app/(painel)/models/[id]/page.tsx`:

(a) Adicionar o import junto aos demais:

```tsx
import { DuplicateModel, type DuplicateProduct } from '../DuplicateModel';
```

(b) Adicionar `product_id` ao tipo `ModelRow` da página (após `image_engine: string;`):

```tsx
  product_id: string | null;
```

(c) Incluir a busca de produtos no `Promise.all` existente e guardá-la:

```tsx
  let products: DuplicateProduct[] = [];
  // dentro do try existente, o Promise.all vira:
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
```

(d) No grupo de ações do cabeçalho, inserir o componente ENTRE o link "Gerar vídeos com esta modelo →" e o `<DeleteButton …>`:

```tsx
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
```

(A constante `refs` já existe na página: `const refs = model.reference_image_urls ?? [];`.)

- [ ] **Passo 3: Typecheck e suíte**

Rodar: `npx tsc --noEmit`
Esperado: sem erros.
Rodar: `npm test`
Esperado: PASS.

- [ ] **Passo 4: Verificação manual no dev server**

Rodar: `npm run dev` e conferir em `http://localhost:3000`:
1. `/models` — card de modelo aprovada mostra `⧉ Duplicar` no rodapé; modelos não aprovadas não mostram.
2. Clicar em `⧉ Duplicar` no card → modal abre com thumb, nome `"<nome> (2)"`, select com produto atual marcado "— atual" e outro pré-selecionado; duplicar → modal fecha e a cópia aparece no topo da grade com pill "Aprovada".
3. `/models/<id>` de uma aprovada → botão `⧉ Duplicar` entre "Gerar vídeos" e "Excluir"; duplicar → navega para a página da cópia (sem banner, produto novo no cabeçalho).
4. A cópia aparece na lista de modelos do formulário de novo lote (`/batches/new`).

Esperado: os 4 fluxos funcionando. (Requer `.env.local` configurado; se o ambiente local não estiver com Supabase ativo, registre isso no relatório da tarefa em vez de pular silenciosamente.)

- [ ] **Passo 5: Commit**

```bash
git add "src/app/(painel)/models/page.tsx" "src/app/(painel)/models/[id]/page.tsx"
git commit -m "feat: duplicar modelo pelo card e pela pagina de detalhe"
```
