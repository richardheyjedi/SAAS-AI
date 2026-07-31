# Design — Referências próprias, UX da página de Modelos e guia de character sheet

Data: 2026-07-31 · Status: aprovado em conversa · Base: página de Modelos existente

## Objetivo

1. Anexar imagens de referência próprias ao criar um modelo (upload real de arquivo), opcionalmente combinadas com referências geradas por IA.
2. Melhorar a UI/UX do formulário de criação e da página de Modelos.
3. Ensinar o usuário a montar um character sheet consistente (dicas na UI).

Decisões de brainstorm: upload direto do navegador para o Supabase Storage (abordagem A — sem rota própria, fora do limite de 4,5 MB da Vercel); usuário controla os dois lados (anexo opcional + contagem de refs IA de 0 a 5; só anexadas → modelo nasce em aprovação sem custo MuAPI).

## 1. Storage — `supabase/migrations/0003_model_refs_bucket.sql`

```sql
insert into storage.buckets (id, name, public) values ('model-refs', 'model-refs', true)
on conflict (id) do nothing;

create policy "authenticated upload model-refs"
on storage.objects for insert to authenticated
with check (bucket_id = 'model-refs');
```

- Leitura pública (a MuAPI baixa as URLs); escrita só autenticado. Sem update/delete por ora (YAGNI).
- Aplicação manual no SQL Editor, como 0001/0002.

## 2. API — `POST /api/models/generate`

`ModelGenerateBodySchema` (em `src/app/api/models/generate/schema.ts`) passa a:

```ts
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

Rota (`route.ts`):
- Persona via Claude continua SEMPRE (necessária para roteiros/composição).
- Insert do modelo: `reference_image_urls: referenceUrls` (anexadas entram primeiro — a posição [0] é a base da composição no cron) e `status: refCount > 0 ? 'generating_refs' : 'pending_approval'`.
- Loop de geração MuAPI roda só quando `refCount > 0` (inalterado no resto). Refs geradas são appendadas pelo webhook DEPOIS das anexadas (comportamento atual de append preservado).
- Só anexadas → nenhuma chamada MuAPI → custo zero.

## 3. Upload no cliente — `ModelForm.tsx`

- Usa `createBrowserSupabase()` (já existe em `src/lib/supabase/browser.ts`) → `storage.from('model-refs').upload(caminho, file)` → `getPublicUrl`.
- Caminho do objeto: `${crypto.randomUUID()}.${ext}` (ext derivada do nome; aceita jpg/jpeg/png/webp).
- Validação client-side: tipo permitido e tamanho ≤ 8 MB por arquivo; máximo 10 fotos.
- Upload acontece na seleção do arquivo (com estado "enviando…"); miniaturas com botão × para remover (remove da lista local; objeto órfão no bucket é aceitável — YAGNI para GC).
- Submit envia `referenceUrls` no body.

## 4. Formulário reorganizado (UI)

Seções na ordem, dentro do card de criação (padrão visual atual — classes `.card`, `.sub`, `.btn`, `.choices` de `globals.css`):
1. Região + prompt personalizado (como hoje).
2. **Suas referências** — botão "Anexar fotos" (input file múltiplo escondido), grade de miniaturas com ×, contador.
3. **Referências por IA** — controle 0–5 (botões segmentados) com custo ao vivo: `modelRefsCostUsd(engine, n)`; em 0, mostra "nenhuma — só as suas fotos".
4. **Motor de imagem** (como hoje).
5. Bloco expansível `<details>` "📸 Como montar um character sheet consistente" (conteúdo na seção 5 deste spec).
6. Validação: botão desabilitado quando total de refs = 0; mensagem clara.

## 5. Guia de character sheet (conteúdo canônico)

Texto exibido no `<details>` do formulário e no empty state da página:

- Use **3 a 5 fotos da MESMA pessoa** — misturar pessoas quebra a consistência.
- Inclua: **rosto de frente bem nítido**, **perfil ou 3/4**, e **corpo inteiro**.
- **Mesma aparência em todas**: cabelo, maquiagem e roupa iguais entre as fotos.
- **Fundo neutro e luz uniforme** (evite sombras duras e contraluz).
- **Sem filtros, óculos escuros ou chapéu** — nada que esconda traços do rosto.
- Resolução mínima ~720p; rosto ocupando boa parte do quadro na foto principal.
- **A 1ª foto é a base da composição dos vídeos** — deixe a melhor em primeiro.
- Para referências geradas por IA: fixe os traços no prompt personalizado (cor e corte de cabelo, cor dos olhos, tom de pele, marcas) — quanto mais específico, mais consistente.

## 6. Página de Modelos (cards + empty state)

- Card do modelo: no lugar de 1 thumb, mini-grade com até 4 primeiras `reference_image_urls` (grid 2×2; célula vazia mantém fundo atual). Restante do card inalterado.
- Empty state (nenhum modelo): card com o guia de character sheet + call-to-action "Criar modelo".

## 7. Erros

- Upload falho: mensagem no form (`pill p-err`), estado de envio limpo, usuário tenta de novo.
- Arquivo inválido (tipo/tamanho): rejeitado client-side com mensagem, sem upload.
- Schema: violação da regra "pelo menos 1 ref" → 400 com a mensagem do refine.

## 8. Testes

- `tests/schemas.test.ts`: refCount 0 aceito com referenceUrls; refCount 0 + sem URLs → rejeitado; URL inválida → rejeitado; máximo 10 URLs; defaults inalterados.
- Upload/UI: verificação manual no navegador (sem framework de teste de componente no projeto — YAGNI).

## Fora de escopo

GC de uploads órfãos; edição/reordenação de refs após criação; upload nos produtos (fica para depois); crop/resize client-side.

## Critérios de sucesso

1. Criar modelo só com fotos anexadas → nasce "Aguardando aprovação", custo US$ 0, fotos aparecem no card.
2. Criar modelo com 2 fotos + 2 refs IA → fotos primeiro no array, IA appenda depois; composição usa a 1ª foto.
3. Guia de character sheet visível no formulário e no empty state.
4. Suíte verde, tsc limpo, build ok.
