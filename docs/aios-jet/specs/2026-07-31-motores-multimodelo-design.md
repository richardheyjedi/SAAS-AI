# Design — Motores multi-modelo e projeção de custo por geração

Data: 2026-07-31 · Status: aprovado em conversa · Autor: brainstorm JET (usuário + Claude)

## Objetivo

1. Escolha do motor de **imagem** por geração: GPT Image 2 ou Nano Banana 2 — tanto nas referências (criação de modelo) quanto na composição (lote).
2. Todas as **9 versões image-to-video do Seedance 2.0** disponíveis como opção na criação de lote.
3. **Projeção de custo** de cada geração conforme o motor escolhido, visível antes de confirmar.
4. **Remoção do teto de gasto diário em USD** (`DAILY_COST_LIMIT_USD`). Permanece apenas o limite diário de vídeos (`DAILY_VIDEO_LIMIT`).

Decisões de brainstorm: tiers = só os 9 i2v padrão (sem spicy/omni/first-last-frame/extend — fluxos de entrada diferentes; spicy bloqueado pela conta); escolha de motor de imagem nos dois fluxos; projeção via tabela local de preços (o `/estimate-cost` da MuAPI retorna valores fixos/errados — verificado em 2026-07-31).

## Abordagem escolhida

**Registro de motores em código** (novo `src/lib/engines.ts`), banco guarda apenas o slug escolhido. Alternativas descartadas: tabela no banco (exige admin UI; overkill single-user) e catálogo vivo da MuAPI (acoplamento + nomes instáveis).

## 1. Registro de motores — `src/lib/engines.ts`

Fonte única de verdade. Tipos:

```ts
export interface ImageEngine {
  id: string;            // slug estável usado no banco
  label: string;
  t2iPath: string;       // endpoint text-to-image (referências)
  i2iPath: string;       // endpoint image-to-image (composição)
  usdPerImage: number;
}

export interface VideoEngine {
  id: string;            // slug do endpoint (== nome no catálogo MuAPI)
  label: string;
  path: string;          // '/api/v1/<slug>'
  usdBase5s: number;     // preço de catálogo do clipe de 5s
  supportsResolution: boolean; // só o Mini expõe resolution (480p/720p)
}
```

Dados (validados contra `GET https://api.muapi.ai/api/v1/models` em 2026-07-31):

| Imagem | t2i | i2i | US$/imagem |
|---|---|---|---|
| `gpt-image-2` | `/api/v1/gpt-image-2-text-to-image` | `/api/v1/gpt-image-2-image-to-image` | 0,09 |
| `nano-banana-2` | `/api/v1/nano-banana-2` | `/api/v1/nano-banana-2-edit` | 0,06 |

| Vídeo (id = slug) | Label | US$ base 5s | resolution? |
|---|---|---|---|
| `seedance-2-mini-image-to-video` | Seedance 2.0 Mini | 0,20 | sim (720p) |
| `seedance-2-i2v-480p` | Seedance 2.0 Standard 480p | 0,60 | não |
| `seedance-2-i2v` | Seedance 2.0 Standard | 0,75 | não |
| `seedance-2-image-to-video-fast` | Seedance 2.0 Fast | 0,75 | não |
| `seedance-2-image-to-video` | Seedance 2.0 Full | 1,25 | não |
| `seedance-2-vip-image-to-video-fast` | Seedance 2.0 VIP Fast | 1,05 | não |
| `seedance-2-vip-image-to-video` | Seedance 2.0 VIP | 1,50 | não |
| `seedance-2-vip-image-to-video-1080p` | Seedance 2.0 VIP 1080p | 3,38 | não |
| `seedance-2-vip-image-to-video-4k` | Seedance 2.0 VIP 4K | 6,75 | não |

Defaults: imagem `gpt-image-2`, vídeo `seedance-2-mini-image-to-video` (comportamento atual).

Helpers exportados: `imageEngine(id)`, `videoEngine(id)` (lançam erro para id desconhecido), `IMAGE_ENGINE_IDS`, `VIDEO_ENGINE_IDS` (para Zod `z.enum`), `DEFAULT_IMAGE_ENGINE`, `DEFAULT_VIDEO_ENGINE`.

## 2. Banco — `supabase/migrations/0002_engines.sql`

```sql
alter table models add column image_engine text not null default 'gpt-image-2';
alter table video_batches add column image_engine text not null default 'gpt-image-2';
alter table video_batches add column video_engine text not null default 'seedance-2-mini-image-to-video';
```

Sem `check` no banco: a validação de slug fica no Zod (registro em código), para que adicionar motor novo não exija migração. Linhas existentes herdam os defaults (== comportamento atual). Migração aplicada manualmente no SQL Editor (single-user, sem pipeline de migração).

## 3. Custo — `src/lib/cost.ts`

- `imageCostUsd(engineId): number` — preço por imagem do motor.
- `videoCostUsd(engineId, durationSeconds): number` — `usdBase5s * (durationSeconds / 5)`, arredondado a 2 casas. **Regra de escala é estimativa**: o catálogo dá o preço do clipe de 5s; 10s = 2× (validado para o Mini; demais tiers extrapolados — `dynamic_pricing` da MuAPI não é consultável de forma confiável).
- `batchCostUsd(imageEngineId, videoEngineId, videoCount, durationSeconds)` — `count × (vídeo + imagem de composição) + SCRIPTS_USD_FLAT (0,05)`.
- `modelRefsCostUsd(imageEngineId, refCount)` — projeção da criação de modelo.
- Remoção: constantes `VIDEO_USD_PER_SECOND` e `IMAGE_USD` deixam de existir (substituídas pelo registro). `usdToBrl` permanece.

## 4. Remoção do teto de gasto

- `src/lib/queue.ts`: `QueueLimits` perde `dailyCostLimitUsd`; `dispatchAllowance(state, limits)` limita **apenas** por `dailyVideoLimit - videosToday`. `queueLimitsFromEnv` para de ler `DAILY_COST_LIMIT_USD`.
- Cron: remove o somatório de `costTodayUsd` do estado de despacho (o `cost_usd` por job **continua sendo gravado** — vira informação, não trava). Circuit breaker de falhas permanece intacto.
- Dashboard: card "Gasto hoje" continua, sem a linha "teto: US$ X".
- `.env.example` / `.env.local` / README: remover `DAILY_COST_LIMIT_USD`.

## 5. MuAPI — `src/lib/muapi.ts`

- `generateImage(cfg, { engineId, prompt, imageUrls? })` — resolve t2i/i2i pelo registro do motor. Payload comum: `prompt`, `aspect_ratio: '9:16'`, e `images_list` quando i2i.
- `generateVideo(cfg, { engineId, imageUrl, prompt, durationSeconds })` — endpoint do registro; payload: `prompt`, `images_list: [imageUrl]`, `duration`, `aspect_ratio: '9:16'`, e `resolution: '720p'` **somente** quando `supportsResolution` (Mini). Campos não suportados pelo tier não são enviados.
- Constantes de path hardcoded atuais somem (movem para o registro). Webhook/parseWebhook inalterados.

## 6. Rotas e fluxo

- `POST /api/models/generate`: body ganha `imageEngine` (`z.enum(IMAGE_ENGINE_IDS)`, default `gpt-image-2`); grava em `models.image_engine`; usa o motor nas referências.
- `POST /api/batches`: body ganha `imageEngine` e `videoEngine` (enums do registro, com defaults); grava no lote; `estimated_cost_usd` calculado com os motores escolhidos.
- Cron `process-queue`: o select de candidatos passa a trazer `video_batches.image_engine` e `video_batches.video_engine`; compose usa o `image_engine` do lote, animate usa o `video_engine`. `perVideo` (gravado em `cost_usd` no claim do animate) usa `videoCostUsd(videoEngine, duration) + imageCostUsd(imageEngine)`.
- Webhook: sem mudança.

## 7. UI

- **`ModelForm`**: seletor de motor de imagem (2 cards/radio com nome + "US$ 0,0X por referência") e projeção "3 referências ≈ US$ 0,27/0,18" atualizada ao vivo.
- **`BatchForm`**:
  - Novo "Passo 4 — Motores": seletor do motor de vídeo — 9 opções mostrando nome + preço por vídeo **na duração selecionada** — e seletor do motor de composição — 2 opções com preço por imagem. (Passos 1-3 atuais permanecem como estão.)
  - Card de custo: linhas "Vídeo · <label do motor>" e "Imagens · <label do motor>" recalculadas ao vivo; nota de rodapé "valores estimados pela tabela de preços da MuAPI".
- **Dashboard**: card "Gasto hoje" sem referência a teto.
- Labels sempre vindos do registro (nada hardcoded na UI).

## 8. Tratamento de erros

- Slug desconhecido chegando ao cron (ex.: linha antiga com motor removido do registro): `videoEngine(id)`/`imageEngine(id)` lançam; o try/catch por job já marca o job como `failed` com a mensagem — não derruba o ciclo.
- Zod rejeita slugs fora do registro nas rotas (400).

## 9. Testes

- `tests/engines.test.ts`: registro íntegro (ids únicos, paths coerentes com os slugs, preços > 0, defaults existem).
- `tests/cost.test.ts`: reescrito por motor — Mini 5s = 0,20; VIP 4K 10s = 13,50; composição GPT 0,09 vs Banana 0,06; `batchCostUsd` combinando motores; `modelRefsCostUsd`.
- `tests/muapi.test.ts`: payload por motor — Banana i2i usa `nano-banana-2-edit`; Mini envia `resolution`, Standard não; endpoint correto por tier.
- `tests/queue.test.ts`: `dispatchAllowance` só por contagem (casos de custo removidos).

## Fora de escopo

Modos especiais do Seedance (spicy/omni/first-last-frame/extend/character); teto de gasto configurável de volta; consulta viva ao catálogo; migração automática de banco; multi-tenant.

## Critérios de sucesso

1. Criar modelo escolhendo Nano Banana 2 → referências geradas via `/api/v1/nano-banana-2`, projeção exibida antes.
2. Criar lote escolhendo qualquer um dos 9 tiers → custo por vídeo e total refletem o tier e a duração; despacho vai ao endpoint certo.
3. `DAILY_COST_LIMIT_USD` não existe mais no código nem nos `.env`; fila limita só por quantidade.
4. Suíte de testes cobrindo registro, custos por motor e payloads por tier — tudo verde; `tsc` e `next build` limpos.
