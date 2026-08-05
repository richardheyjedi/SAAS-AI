# Duplicar modelo trocando o produto — Design

**Data:** 2026-08-05
**Status:** aprovado pelo usuário (brainstorm em sessão)

## Objetivo

Permitir duplicar uma modelo (creator virtual) já criada, mantendo o mesmo rosto — as mesmas imagens de referência — e trocando apenas o produto associado (ex.: de garrafa fitness para fone de ouvido). Custo da operação: US$ 0 (nenhuma chamada a Claude ou MuAPI).

## Decisões de produto (fechadas no brainstorm)

1. **Cópia idêntica da persona.** A persona (nome, idade, nicho, personalidade, estilo de fala, `image_prompt`) é copiada exatamente como está; só `product_id` e o nome do registro mudam. Re-adaptação da persona via Claude ficou **fora de escopo** (foi oferecida e recusada).
2. **UI em dois pontos:** botão na página de detalhe da modelo E atalho no card da listagem, ambos abrindo o mesmo modal.
3. **Só modelos `approved` podem ser duplicadas.** Modelos em `generating_refs` têm refs incompletas; `pending_approval` ainda não teve o rosto validado. A cópia nasce direto com `status: 'approved'`.

## Regras de negócio

- A cópia recebe: `name` (informado no modal, default `"<nome original> (2)"`), `region`, `persona` (idêntica), `reference_image_urls` (mesmas URLs — sem cópia física no bucket), `image_engine`, `status: 'approved'`, `product_id` = produto escolhido.
- `image_jobs` NÃO são copiados (são histórico de geração da original).
- Duplicar mantendo o mesmo produto é permitido (serve para variar nome/gestão), mas o select pré-seleciona o primeiro produto que **não** seja o atual — o caso de uso principal é trocar.
- Nome duplicado não é bloqueado (não há unicidade de nome no banco; é só rótulo).

## Backend

Nova rota `POST /api/models/[id]/duplicate` com `schema.ts` ao lado (padrão de `api/batches` e `api/models/generate`).

**Body (Zod):** `{ productId: uuid obrigatório, name: string opcional (trim; vazio → usa default) }`

**Fluxo:**
1. Autentica (401 se não logado).
2. Valida body (400 com `error.flatten()`).
3. Busca a modelo original (404 se não existe; 409 se `status !== 'approved'`).
4. Confere que o produto existe (404 "Produto não encontrado").
5. `insert` único e atômico em `models` conforme regras acima.
6. Retorna `{ modelId }` com 201. Falha de insert → 500 com mensagem legível.

Sem migração de banco: todas as colunas necessárias já existem.

## UI / UX

### Componente novo: `src/app/(painel)/models/DuplicateModel.tsx` (client)

Um único componente com duas variantes de gatilho, controladas por prop:

- `variant="button"` — página de detalhe: `<button className="btn">⧉ Duplicar</button>` no grupo de ações do cabeçalho, entre "Gerar vídeos com esta modelo →" e "🗑 Excluir". Renderizado só quando `status === 'approved'` (mesma condição do botão de gerar vídeos).
- `variant="cardAction"` — card da listagem: botão compacto no `.card-foot`, ao lado do contador de refs, com o mesmo estilo do botão "Aprovar" que já existe ali (`padding: '3px 10px', fontSize: 12`). Texto: `⧉ Duplicar`. Só para modelos `approved` — nos demais status o rodapé fica como está hoje.

Props: `{ modelId, modelName, currentProductId, products: {id,title}[], variant, thumbUrl }` — `products` já é buscado pela página de listagem hoje (`select('id,title')`); a página de detalhe passa a buscá-lo também.

### Modal (esqueleto `Modal` existente, `maxWidth={440}`)

Layout interno: `<form>` com `display:grid; gap:14` (mesmo ritmo vertical de `ModelForm`/`EditProduct`; o `.modal` já contribui `gap:14` entre cabeçalho e conteúdo).

Ordem dos elementos, de cima para baixo:

1. **Contexto visual** — linha `display:flex; align-items:center; gap:10`: thumbnail da referência base (36×36, `border-radius:8px`, `object-fit:cover`) + coluna com `<b>{modelName}</b>` e `<span className="sub" style={{fontSize:11.5}}>mesmo rosto, mesmas referências</span>` + `<span className="pill p-ok">custo US$ 0,00</span>` alinhado à direita (`margin-left:auto`). Dá confiança imediata de qual rosto está sendo duplicado e que é grátis.
2. **Nome da cópia** — `.lbl` + `.field`, pré-preenchido `"<nome> (2)"`, `autoFocus` (obrigatório para o Esc do `Modal` funcionar). Sem contador, sem validação além de trim.
3. **Novo produto** — `.lbl` + `select.field`. Todos os produtos; o atual da original ganha sufixo `" — atual"` no rótulo. Pré-seleção: primeiro produto ≠ atual (se só existe o atual, ele mesmo).
4. **Alerta de erro** — `.alert`, só quando houver erro (mesma posição dos outros formulários: logo acima dos botões).
5. **Botões** — `display:flex; gap:8; justify-content:flex-end`: `Cancelar` (`.btn`, disabled durante loading) e `⧉ Duplicar` (`.btn primary`, disabled durante loading, texto vira `"Duplicando…"`).

**Estado vazio (sem produtos cadastrados):** no lugar dos campos 2–4, um bloco `.sub` com a mensagem "Cadastre um produto primeiro — a duplicação existe para vender outro produto com o mesmo rosto." e um `<Link href="/products" className="btn">Ir para Produtos →</Link>`. O botão primário some.

### Navegação pós-sucesso

- Pelo **detalhe**: `router.push('/models/' + novoId)` — usuário cai na página da cópia (já `approved`, sem banner, novo produto no cabeçalho), de onde o caminho natural é "Gerar vídeos →".
- Pelo **card**: fecha modal + `router.refresh()` — a cópia aparece no topo da grade (ordenação `created_at desc` existente).

### Acessibilidade e microdetalhes

- O `Modal` já fornece `role="dialog"`, `aria-modal`, fechamento por Esc/clique-fora bloqueado durante `busy` — passar `busy={loading}`.
- `aria-label="Duplicar modelo <nome>"` no gatilho do card (o texto visível é curto).
- No card, o botão fica dentro do `.card-foot`, FORA do `<Link>` que envolve o corpo do card — clique não pode navegar para o detalhe (`stopPropagation` não é necessário porque o foot já está fora do link hoje).
- Focus ring: já coberto por `.btn:focus-visible` e `.field:focus` globais.

## Tratamento de erros

| Cenário | Comportamento |
|---|---|
| Sessão expirada (401) | Alerta no modal: "Sessão expirada — recarregue a página." |
| Modelo não-approved (409) | Alerta com a mensagem da API (defesa extra; a UI já esconde o botão) |
| Produto sumiu entre abrir o modal e enviar (404) | Alerta "Produto não encontrado — atualize a página." |
| Falha de insert (500) | Alerta com mensagem legível; nada é criado parcialmente (insert único) |
| Rede | Alerta genérico "Não foi possível duplicar. Tente novamente." |

## Testes (Vitest, padrão de `tests/schemas.test.ts`)

- Schema: body válido passa; `productId` ausente ou não-uuid falha; `name` vazio/whitespace → tratado como ausente (default aplicado na rota).
- Nenhum teste de UI (projeto não tem infra de teste de componente; consistente com o restante).

## Fora de escopo

- Re-adaptação de persona via Claude ao novo produto.
- Duplicar modelos `generating_refs`/`pending_approval`.
- Cópia física das imagens no storage (URLs compartilhadas são aceitáveis; a exclusão da original não apaga arquivos do bucket hoje — comportamento inalterado).
- Unicidade/validação de nome.
