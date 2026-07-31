# Plano de Implementação: Motores multi-modelo e custo por geração

> **Para quem for executar:** SUB-SKILL OBRIGATÓRIA: use a skill `jet-subagentes` para implementar este plano tarefa por tarefa, com um agente `jet-implementador` por tarefa e revisão via `jet-revisor` entre tarefas. Passos usam sintaxe de checkbox (`- [ ]`) para rastreamento.

**Objetivo:** Permitir escolher o motor de imagem (GPT Image 2 / Nano Banana 2) e qualquer um dos 9 tiers image-to-video do Seedance 2.0 por geração, com projeção de custo antes de confirmar, e remover o teto de gasto diário em USD.

**Arquitetura:** Um registro de motores em código (`src/lib/engines.ts`) é a fonte única de slugs, labels e preços; o banco guarda apenas o slug escolhido (`models.image_engine`, `video_batches.image_engine`, `video_batches.video_engine`). Custo, payloads MuAPI, rotas e UI derivam tudo do registro. A fila passa a limitar despacho só por quantidade diária de vídeos.

**Stack técnica:** Next.js 15 (App Router), TypeScript, Zod, Supabase, Vitest.

**Spec:** `docs/aios-jet/specs/2026-07-31-motores-multimodelo-design.md`

## Restrições globais

- Repo: `C:\Users\richa\AutoReelsAI` (Windows; rodar comandos a partir da raiz do repo).
- Preços e slugs EXATOS do spec (validados no catálogo MuAPI em 2026-07-31) — não inventar/alterar.
- Defaults preservam o comportamento atual: imagem `gpt-image-2`, vídeo `seedance-2-mini-image-to-video`.
- `aspect_ratio: '9:16'` em toda geração; `resolution: '720p'` SÓ para o tier Mini.
- Escala de duração do custo de vídeo: `usdBase5s * (durationSeconds / 5)`, arredondado a 2 casas.
- Toda tarefa termina com `npx vitest run` verde e `npx tsc --noEmit` exit 0.
- Mensagens de commit em português, com `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- NÃO tocar em: webhook (`src/app/api/webhooks/muapi/route.ts`), middleware, autenticação.

---

### Tarefa 1: Registro de motores

**Arquivos:**
- Criar: `src/lib/engines.ts`
- Teste: `tests/engines.test.ts`

**Interfaces:**
- Consome: nada (folha nova).
- Produz (tarefas 2-6 dependem): tipos `ImageEngine { id, label, t2iPath, i2iPath, usdPerImage }` e `VideoEngine { id, label, usdBase5s, supportsResolution }`; arrays `IMAGE_ENGINES`, `VIDEO_ENGINES`; tuplas `IMAGE_ENGINE_IDS`, `VIDEO_ENGINE_IDS` (para `z.enum`); constantes `DEFAULT_IMAGE_ENGINE = 'gpt-image-2'`, `DEFAULT_VIDEO_ENGINE = 'seedance-2-mini-image-to-video'`; funções `imageEngine(id): ImageEngine` e `videoEngine(id): VideoEngine` que LANÇAM `Error` para id desconhecido; `videoEnginePath(engine): string` = `'/api/v1/' + engine.id`.

- [ ] **Passo 1: Escrever o teste que falha**

Criar `tests/engines.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  IMAGE_ENGINES, VIDEO_ENGINES, IMAGE_ENGINE_IDS, VIDEO_ENGINE_IDS,
  DEFAULT_IMAGE_ENGINE, DEFAULT_VIDEO_ENGINE,
  imageEngine, videoEngine, videoEnginePath,
} from '@/lib/engines';

describe('registro de motores de imagem', () => {
  it('tem exatamente gpt-image-2 e nano-banana-2, com preços do catálogo', () => {
    expect(IMAGE_ENGINE_IDS).toEqual(['gpt-image-2', 'nano-banana-2']);
    expect(imageEngine('gpt-image-2').usdPerImage).toBe(0.09);
    expect(imageEngine('nano-banana-2').usdPerImage).toBe(0.06);
  });
  it('nano-banana-2 usa o endpoint -edit para image-to-image', () => {
    expect(imageEngine('nano-banana-2').t2iPath).toBe('/api/v1/nano-banana-2');
    expect(imageEngine('nano-banana-2').i2iPath).toBe('/api/v1/nano-banana-2-edit');
    expect(imageEngine('gpt-image-2').i2iPath).toBe('/api/v1/gpt-image-2-image-to-image');
  });
});

describe('registro de motores de vídeo', () => {
  it('tem os 9 tiers Seedance 2.0 com ids únicos', () => {
    expect(VIDEO_ENGINES).toHaveLength(9);
    expect(new Set(VIDEO_ENGINE_IDS).size).toBe(9);
  });
  it('preços de catálogo nos extremos e só o Mini com resolution', () => {
    expect(videoEngine('seedance-2-mini-image-to-video').usdBase5s).toBe(0.2);
    expect(videoEngine('seedance-2-vip-image-to-video-4k').usdBase5s).toBe(6.75);
    expect(VIDEO_ENGINES.filter((e) => e.supportsResolution).map((e) => e.id))
      .toEqual(['seedance-2-mini-image-to-video']);
  });
  it('path deriva do id e defaults existem no registro', () => {
    expect(videoEnginePath(videoEngine('seedance-2-i2v'))).toBe('/api/v1/seedance-2-i2v');
    expect(IMAGE_ENGINE_IDS).toContain(DEFAULT_IMAGE_ENGINE);
    expect(VIDEO_ENGINE_IDS).toContain(DEFAULT_VIDEO_ENGINE);
  });
  it('id desconhecido lança erro', () => {
    expect(() => imageEngine('sora')).toThrow(/desconhecido/);
    expect(() => videoEngine('kling')).toThrow(/desconhecido/);
  });
});
```

- [ ] **Passo 2: Rodar o teste para confirmar que falha**

Rodar: `npx vitest run tests/engines.test.ts`
Esperado: FAIL — "Cannot find module '@/lib/engines'"

- [ ] **Passo 3: Escrever a implementação**

Criar `src/lib/engines.ts`:

```ts
// Fonte única de verdade dos motores de geração.
// Slugs e preços validados contra GET https://api.muapi.ai/api/v1/models em 2026-07-31.

export interface ImageEngine {
  id: string;
  label: string;
  t2iPath: string;
  i2iPath: string;
  usdPerImage: number;
}

export interface VideoEngine {
  id: string; // slug do endpoint MuAPI: POST /api/v1/<id>
  label: string;
  usdBase5s: number; // preço de catálogo do clipe de 5s
  supportsResolution: boolean; // só o Mini expõe o campo resolution
}

export const IMAGE_ENGINES: ImageEngine[] = [
  { id: 'gpt-image-2', label: 'GPT Image 2', t2iPath: '/api/v1/gpt-image-2-text-to-image', i2iPath: '/api/v1/gpt-image-2-image-to-image', usdPerImage: 0.09 },
  { id: 'nano-banana-2', label: 'Nano Banana 2', t2iPath: '/api/v1/nano-banana-2', i2iPath: '/api/v1/nano-banana-2-edit', usdPerImage: 0.06 },
];

export const VIDEO_ENGINES: VideoEngine[] = [
  { id: 'seedance-2-mini-image-to-video', label: 'Seedance 2.0 Mini', usdBase5s: 0.2, supportsResolution: true },
  { id: 'seedance-2-i2v-480p', label: 'Seedance 2.0 Standard 480p', usdBase5s: 0.6, supportsResolution: false },
  { id: 'seedance-2-i2v', label: 'Seedance 2.0 Standard', usdBase5s: 0.75, supportsResolution: false },
  { id: 'seedance-2-image-to-video-fast', label: 'Seedance 2.0 Fast', usdBase5s: 0.75, supportsResolution: false },
  { id: 'seedance-2-image-to-video', label: 'Seedance 2.0 Full', usdBase5s: 1.25, supportsResolution: false },
  { id: 'seedance-2-vip-image-to-video-fast', label: 'Seedance 2.0 VIP Fast', usdBase5s: 1.05, supportsResolution: false },
  { id: 'seedance-2-vip-image-to-video', label: 'Seedance 2.0 VIP', usdBase5s: 1.5, supportsResolution: false },
  { id: 'seedance-2-vip-image-to-video-1080p', label: 'Seedance 2.0 VIP 1080p', usdBase5s: 3.375, supportsResolution: false },
  { id: 'seedance-2-vip-image-to-video-4k', label: 'Seedance 2.0 VIP 4K', usdBase5s: 6.75, supportsResolution: false },
];

export const DEFAULT_IMAGE_ENGINE = 'gpt-image-2';
export const DEFAULT_VIDEO_ENGINE = 'seedance-2-mini-image-to-video';

export const IMAGE_ENGINE_IDS = IMAGE_ENGINES.map((e) => e.id) as [string, ...string[]];
export const VIDEO_ENGINE_IDS = VIDEO_ENGINES.map((e) => e.id) as [string, ...string[]];

export function imageEngine(id: string): ImageEngine {
  const engine = IMAGE_ENGINES.find((e) => e.id === id);
  if (!engine) throw new Error(`Motor de imagem desconhecido: ${id}`);
  return engine;
}

export function videoEngine(id: string): VideoEngine {
  const engine = VIDEO_ENGINES.find((e) => e.id === id);
  if (!engine) throw new Error(`Motor de vídeo desconhecido: ${id}`);
  return engine;
}

export function videoEnginePath(engine: VideoEngine): string {
  return `/api/v1/${engine.id}`;
}
```

- [ ] **Passo 4: Rodar os testes e o type-check**

Rodar: `npx vitest run tests/engines.test.ts` → PASS (5 testes)
Rodar: `npx vitest run` → PASS (suíte completa)
Rodar: `npx tsc --noEmit` → exit 0

- [ ] **Passo 5: Commit**

```bash
git add src/lib/engines.ts tests/engines.test.ts
git commit -m "feat: registro de motores de imagem e video (2 imagem + 9 tiers Seedance 2.0)"
```

---

### Tarefa 2: Custo por motor

**Arquivos:**
- Modificar: `src/lib/cost.ts` (arquivo inteiro substituído)
- Modificar: `src/app/api/batches/route.ts:43` (chamada `batchCostUsd`)
- Modificar: `src/app/api/cron/process-queue/route.ts:~131` (cálculo `perVideo`)
- Modificar: `src/app/(painel)/batches/new/BatchForm.tsx:5,41-43,168-183` (imports e linhas de custo)
- Teste: `tests/cost.test.ts` (reescrito)

**Interfaces:**
- Consome (Tarefa 1): `imageEngine(id)`, `videoEngine(id)`, `DEFAULT_IMAGE_ENGINE`, `DEFAULT_VIDEO_ENGINE` de `@/lib/engines`.
- Produz (tarefas 4-6 dependem): `imageCostUsd(engineId: string): number`; `videoCostUsd(engineId: string, durationSeconds: number): number`; `batchCostUsd(imageEngineId: string, videoEngineId: string, videoCount: number, durationSeconds: number): number`; `modelRefsCostUsd(imageEngineId: string, refCount: number): number`; `usdToBrl(usd: number): number`; `SCRIPTS_USD_FLAT`. As constantes `VIDEO_USD_PER_SECOND` e `IMAGE_USD` DEIXAM DE EXISTIR.

- [ ] **Passo 1: Reescrever o teste (que vai falhar)**

Substituir TODO o conteúdo de `tests/cost.test.ts` por:

```ts
import { describe, it, expect } from 'vitest';
import { batchCostUsd, imageCostUsd, modelRefsCostUsd, usdToBrl, videoCostUsd } from '@/lib/cost';

describe('custo por motor', () => {
  it('vídeo escala pelo preço base de 5s do tier', () => {
    expect(videoCostUsd('seedance-2-mini-image-to-video', 5)).toBe(0.2);
    expect(videoCostUsd('seedance-2-mini-image-to-video', 10)).toBe(0.4);
    expect(videoCostUsd('seedance-2-vip-image-to-video-4k', 10)).toBe(13.5);
    expect(videoCostUsd('seedance-2-i2v', 5)).toBe(0.75);
  });
  it('imagem custa o preço do motor', () => {
    expect(imageCostUsd('gpt-image-2')).toBe(0.09);
    expect(imageCostUsd('nano-banana-2')).toBe(0.06);
  });
  it('lote combina vídeo + imagem de composição + roteiros', () => {
    // 20 × (0.20 + 0.09) + 0.05
    expect(batchCostUsd('gpt-image-2', 'seedance-2-mini-image-to-video', 20, 5)).toBe(5.85);
    // 3 × (1.50 + 0.06) + 0.05
    expect(batchCostUsd('nano-banana-2', 'seedance-2-vip-image-to-video', 3, 5)).toBe(4.73);
  });
  it('projeção das referências do modelo', () => {
    expect(modelRefsCostUsd('gpt-image-2', 3)).toBe(0.27);
    expect(modelRefsCostUsd('nano-banana-2', 3)).toBe(0.18);
  });
  it('motor desconhecido lança erro', () => {
    expect(() => videoCostUsd('sora', 5)).toThrow(/desconhecido/);
    expect(() => imageCostUsd('dall-e')).toThrow(/desconhecido/);
  });
  it('conversão aproximada para BRL a 5.00', () => {
    expect(usdToBrl(5.85)).toBe(29.25);
  });
});
```

- [ ] **Passo 2: Rodar para confirmar que falha**

Rodar: `npx vitest run tests/cost.test.ts`
Esperado: FAIL — assinaturas antigas não batem (`videoCostUsd` recebia só duração).

- [ ] **Passo 3: Reescrever `src/lib/cost.ts`**

Substituir TODO o conteúdo por:

```ts
import { imageEngine, videoEngine } from './engines';

export const SCRIPTS_USD_FLAT = 0.05;
export const USD_TO_BRL = 5;

const round2 = (v: number) => Math.round(v * 100) / 100;

export function imageCostUsd(imageEngineId: string): number {
  return imageEngine(imageEngineId).usdPerImage;
}

// O catálogo dá o preço do clipe de 5s; outras durações são extrapoladas
// linearmente (validado para o Mini; estimativa para os demais tiers).
export function videoCostUsd(videoEngineId: string, durationSeconds: number): number {
  return round2(videoEngine(videoEngineId).usdBase5s * (durationSeconds / 5));
}

export function batchCostUsd(
  imageEngineId: string, videoEngineId: string, videoCount: number, durationSeconds: number,
): number {
  const perVideo = videoCostUsd(videoEngineId, durationSeconds) + imageCostUsd(imageEngineId);
  return round2(videoCount * perVideo + SCRIPTS_USD_FLAT);
}

export function modelRefsCostUsd(imageEngineId: string, refCount: number): number {
  return round2(imageCostUsd(imageEngineId) * refCount);
}

export function usdToBrl(usd: number): number {
  return round2(usd * USD_TO_BRL);
}
```

- [ ] **Passo 4: Migrar os 3 consumidores (mecânico, comportamento preservado via defaults)**

Em `src/app/api/batches/route.ts`, a linha:

```ts
  const estimated = batchCostUsd(actualCount, durationSeconds);
```

vira (adicionar o import de `@/lib/engines` no topo):

```ts
import { DEFAULT_IMAGE_ENGINE, DEFAULT_VIDEO_ENGINE } from '@/lib/engines';
// ...
  const estimated = batchCostUsd(DEFAULT_IMAGE_ENGINE, DEFAULT_VIDEO_ENGINE, actualCount, durationSeconds);
```

Em `src/app/api/cron/process-queue/route.ts`, o import `videoCostUsd` vira `videoCostUsd, imageCostUsd`, o import de engines é adicionado, e a linha:

```ts
      const perVideo = videoCostUsd(batch.duration_seconds);
```

vira:

```ts
import { DEFAULT_IMAGE_ENGINE, DEFAULT_VIDEO_ENGINE } from '@/lib/engines';
// ...
      const perVideo = videoCostUsd(DEFAULT_VIDEO_ENGINE, batch.duration_seconds)
        + imageCostUsd(DEFAULT_IMAGE_ENGINE);
```

Em `src/app/(painel)/batches/new/BatchForm.tsx`, o import (linha 5):

```ts
import { batchCostUsd, usdToBrl, VIDEO_USD_PER_SECOND, IMAGE_USD } from '@/lib/cost';
```

vira:

```ts
import { batchCostUsd, imageCostUsd, usdToBrl, videoCostUsd } from '@/lib/cost';
import { DEFAULT_IMAGE_ENGINE, DEFAULT_VIDEO_ENGINE } from '@/lib/engines';
```

As linhas de cálculo (41-44):

```ts
  const videoLine = qty * duration * VIDEO_USD_PER_SECOND;
  const imageLine = qty * IMAGE_USD;
  const total = useMemo(() => batchCostUsd(qty, duration), [qty, duration]);
```

viram:

```ts
  const perVideoUsd = videoCostUsd(DEFAULT_VIDEO_ENGINE, duration);
  const videoLine = qty * perVideoUsd;
  const imageLine = qty * imageCostUsd(DEFAULT_IMAGE_ENGINE);
  const total = useMemo(
    () => batchCostUsd(DEFAULT_IMAGE_ENGINE, DEFAULT_VIDEO_ENGINE, qty, duration),
    [qty, duration],
  );
```

E a linha de detalhamento no card de custo (a `<span>` com `US$ {VIDEO_USD_PER_SECOND...}/s`):

```tsx
          <span>
            {qty} × {duration}s × US$ {VIDEO_USD_PER_SECOND.toFixed(2).replace('.', ',')}/s
          </span>
```

vira:

```tsx
          <span>
            {qty} × {formatUsd(perVideoUsd)} por vídeo
          </span>
```

- [ ] **Passo 5: Rodar suíte completa + type-check**

Rodar: `npx vitest run` → PASS · `npx tsc --noEmit` → exit 0

- [ ] **Passo 6: Commit**

```bash
git add src/lib/cost.ts tests/cost.test.ts src/app/api/batches/route.ts src/app/api/cron/process-queue/route.ts "src/app/(painel)/batches/new/BatchForm.tsx"
git commit -m "feat: custo por motor (imageCostUsd/videoCostUsd/batchCostUsd/modelRefsCostUsd)"
```

---

### Tarefa 3: MuAPI por motor

**Arquivos:**
- Modificar: `src/lib/muapi.ts:3-7,44-67` (remove paths hardcoded; `generateImage`/`generateVideo` ganham `engineId`)
- Modificar: `src/app/api/models/generate/route.ts:35-38` (chamada com `engineId` default)
- Modificar: `src/app/api/cron/process-queue/route.ts:~118-140` (chamadas com `engineId` default)
- Teste: `tests/muapi.test.ts` (casos novos por motor)

**Interfaces:**
- Consome (Tarefa 1): `imageEngine`, `videoEngine`, `videoEnginePath`, defaults.
- Produz (tarefas 4-5 dependem): `generateImage(cfg, { engineId: string; prompt: string; imageUrls?: string[] })`; `generateVideo(cfg, { engineId: string; imageUrl: string; prompt: string; durationSeconds: number })`. Ambas retornam `Promise<{ requestId: string }>` como hoje. `parseWebhook`/`muApiConfigFromEnv` inalterados.

- [ ] **Passo 1: Atualizar testes (vão falhar)**

Em `tests/muapi.test.ts`, TODAS as chamadas de `generateImage`/`generateVideo` ganham `engineId`. Substituir os describes `generateImage` e `generateVideo` por:

```ts
describe('generateImage', () => {
  it('sem imagens usa o t2i do motor, com api key e webhook na query', async () => {
    const r = await generateImage(cfg, { engineId: 'gpt-image-2', prompt: 'foto' });
    expect(r.requestId).toBe('req_1');
    const [url, init] = lastCall() as [string, RequestInit];
    expect(String(url)).toContain('/api/v1/gpt-image-2-text-to-image');
    expect(String(url)).toContain(`webhook=${encodeURIComponent(cfg.webhookUrl)}`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('k');
    const body = JSON.parse(String(init.body));
    expect(body.aspect_ratio).toBe('9:16');
  });
  it('nano-banana-2 com imagens usa o endpoint -edit', async () => {
    await generateImage(cfg, { engineId: 'nano-banana-2', prompt: 'compor', imageUrls: ['https://x/1.png'] });
    const [url, init] = lastCall() as [string, RequestInit];
    expect(String(url)).toContain('/api/v1/nano-banana-2-edit');
    expect(JSON.parse(String(init.body)).images_list).toEqual(['https://x/1.png']);
  });
  it('gpt-image-2 com imagens usa image-to-image', async () => {
    await generateImage(cfg, { engineId: 'gpt-image-2', prompt: 'compor', imageUrls: ['https://x/1.png'] });
    expect(String(lastCall()[0])).toContain('/api/v1/gpt-image-2-image-to-image');
  });
  it('motor desconhecido lança de forma síncrona, sem chamar a rede', () => {
    // imageEngine() lança antes do submit — o throw é síncrono, não uma Promise rejeitada.
    expect(() => generateImage(cfg, { engineId: 'dall-e', prompt: 'x' })).toThrow(/desconhecido/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('aceita resposta com id no lugar de request_id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'task_7' }), { status: 200 })));
    const r = await generateImage(cfg, { engineId: 'gpt-image-2', prompt: 'x' });
    expect(r.requestId).toBe('task_7');
  });
  it('lança erro em resposta não-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 402 })));
    await expect(generateImage(cfg, { engineId: 'gpt-image-2', prompt: 'x' })).rejects.toThrow(/MuAPI 402/);
  });
});

describe('generateVideo', () => {
  it('mini envia images_list, duration, resolution 720p e 9:16', async () => {
    await generateVideo(cfg, { engineId: 'seedance-2-mini-image-to-video', imageUrl: 'https://x/base.png', prompt: 'mexe', durationSeconds: 5 });
    const [url, init] = lastCall() as [string, RequestInit];
    expect(String(url)).toContain('/api/v1/seedance-2-mini-image-to-video');
    const body = JSON.parse(String(init.body));
    expect(body.images_list).toEqual(['https://x/base.png']);
    expect(body.duration).toBe(5);
    expect(body.resolution).toBe('720p');
    expect(body.aspect_ratio).toBe('9:16');
  });
  it('tiers sem resolution não enviam o campo e vão ao endpoint do tier', async () => {
    await generateVideo(cfg, { engineId: 'seedance-2-vip-image-to-video', imageUrl: 'https://x/b.png', prompt: 'm', durationSeconds: 10 });
    const [url, init] = lastCall() as [string, RequestInit];
    expect(String(url)).toContain('/api/v1/seedance-2-vip-image-to-video');
    const body = JSON.parse(String(init.body));
    expect(body.resolution).toBeUndefined();
    expect(body.duration).toBe(10);
  });
});
```

- [ ] **Passo 2: Rodar para confirmar que falha**

Rodar: `npx vitest run tests/muapi.test.ts` → FAIL (assinaturas sem `engineId`).

- [ ] **Passo 3: Implementar em `src/lib/muapi.ts`**

Remover as constantes `IMAGE_T2I_PATH`, `IMAGE_I2I_PATH`, `VIDEO_MODEL_PATH` (e o comentário de slugs acima delas) e adicionar o import:

```ts
import { imageEngine, videoEngine, videoEnginePath } from './engines';
```

Substituir `generateImage` e `generateVideo` por:

```ts
export function generateImage(
  cfg: MuApiConfig,
  input: { engineId: string; prompt: string; imageUrls?: string[] },
) {
  const engine = imageEngine(input.engineId);
  if (input.imageUrls?.length) {
    return submit(cfg, engine.i2iPath, {
      prompt: input.prompt,
      images_list: input.imageUrls,
      aspect_ratio: ASPECT_RATIO,
    });
  }
  return submit(cfg, engine.t2iPath, { prompt: input.prompt, aspect_ratio: ASPECT_RATIO });
}

export function generateVideo(
  cfg: MuApiConfig,
  input: { engineId: string; imageUrl: string; prompt: string; durationSeconds: number },
) {
  const engine = videoEngine(input.engineId);
  const payload: Record<string, unknown> = {
    prompt: input.prompt,
    images_list: [input.imageUrl],
    duration: input.durationSeconds,
    aspect_ratio: ASPECT_RATIO,
  };
  // Campos que o tier não expõe não são enviados (só o Mini tem resolution).
  if (engine.supportsResolution) payload.resolution = '720p';
  return submit(cfg, videoEnginePath(engine), payload);
}
```

Nota: o comentário sobre formato vertical e a constante `ASPECT_RATIO = '9:16'` permanecem.

- [ ] **Passo 4: Migrar call sites (mecânico, defaults)**

`src/app/api/models/generate/route.ts` — adicionar `import { DEFAULT_IMAGE_ENGINE } from '@/lib/engines';` e na chamada dentro do loop:

```ts
    const { requestId } = await generateImage(cfg, {
      engineId: DEFAULT_IMAGE_ENGINE,
      prompt: `${persona.image_prompt} — reference shot ${i + 1}, same person, slightly different pose`,
    });
```

`src/app/api/cron/process-queue/route.ts` — nas duas chamadas (o import de defaults já existe da Tarefa 2):

```ts
        const { requestId } = await generateImage(cfg, {
          engineId: DEFAULT_IMAGE_ENGINE,
          prompt: `${persona.image_prompt}. ${script.scene_description}. The person must look identical to the reference photos.`,
          imageUrls: refs,
        });
```

```ts
        const { requestId } = await generateVideo(cfg, {
          engineId: DEFAULT_VIDEO_ENGINE,
          imageUrl: job.composed_image_url!,
          prompt: script.motion_prompt,
          durationSeconds: batch.duration_seconds,
        });
```

- [ ] **Passo 5: Rodar suíte completa + type-check**

Rodar: `npx vitest run` → PASS · `npx tsc --noEmit` → exit 0

- [ ] **Passo 6: Commit**

```bash
git add src/lib/muapi.ts tests/muapi.test.ts src/app/api/models/generate/route.ts src/app/api/cron/process-queue/route.ts
git commit -m "feat: generateImage/generateVideo por motor com payload por tier"
```

---

### Tarefa 4: Migração 0002 e rotas com motores

**Arquivos:**
- Criar: `supabase/migrations/0002_engines.sql`
- Criar: `src/app/api/models/generate/schema.ts`
- Criar: `src/app/api/batches/schema.ts`
- Modificar: `src/app/api/models/generate/route.ts` (usa schema novo, grava e usa `image_engine`)
- Modificar: `src/app/api/batches/route.ts` (usa schema novo, grava engines, custo com engines)
- Teste: `tests/schemas.test.ts`

**Interfaces:**
- Consome: `IMAGE_ENGINE_IDS`, `VIDEO_ENGINE_IDS`, defaults (T1); `batchCostUsd` (T2); `generateImage` (T3).
- Produz (T5-6 dependem): `ModelGenerateBodySchema` em `src/app/api/models/generate/schema.ts` com campo `imageEngine`; `BatchBodySchema` em `src/app/api/batches/schema.ts` com campos `imageEngine`/`videoEngine`; colunas `models.image_engine`, `video_batches.image_engine`, `video_batches.video_engine` no banco.

**Nota:** rotas do App Router não podem exportar símbolos arbitrários — por isso os schemas vão para arquivos `schema.ts` próprios, importados pela rota e pelos testes.

- [ ] **Passo 1: Criar a migração**

Criar `supabase/migrations/0002_engines.sql`:

```sql
alter table models add column image_engine text not null default 'gpt-image-2';
alter table video_batches add column image_engine text not null default 'gpt-image-2';
alter table video_batches add column video_engine text not null default 'seedance-2-mini-image-to-video';
```

(A aplicação no Supabase é manual, feita pelo controlador após o merge — o executor apenas cria o arquivo.)

- [ ] **Passo 2: Escrever os testes de schema (vão falhar)**

Criar `tests/schemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ModelGenerateBodySchema } from '@/app/api/models/generate/schema';
import { BatchBodySchema } from '@/app/api/batches/schema';

const uuid = '4c1f1e07-4a3e-4b6e-9d1a-3a2b1c0d9e8f';

describe('ModelGenerateBodySchema', () => {
  it('default do motor é gpt-image-2 e aceita nano-banana-2', () => {
    expect(ModelGenerateBodySchema.parse({ region: 'br' }).imageEngine).toBe('gpt-image-2');
    expect(ModelGenerateBodySchema.parse({ region: 'us', imageEngine: 'nano-banana-2' }).imageEngine).toBe('nano-banana-2');
  });
  it('rejeita motor fora do registro', () => {
    expect(ModelGenerateBodySchema.safeParse({ region: 'br', imageEngine: 'dall-e' }).success).toBe(false);
  });
});

describe('BatchBodySchema', () => {
  const base = { modelId: uuid, productId: uuid, videoCount: 3, durationSeconds: 5 };
  it('defaults preservam o comportamento atual', () => {
    const p = BatchBodySchema.parse(base);
    expect(p.imageEngine).toBe('gpt-image-2');
    expect(p.videoEngine).toBe('seedance-2-mini-image-to-video');
  });
  it('aceita qualquer um dos 9 tiers de vídeo', () => {
    expect(BatchBodySchema.parse({ ...base, videoEngine: 'seedance-2-vip-image-to-video-4k' }).videoEngine)
      .toBe('seedance-2-vip-image-to-video-4k');
  });
  it('rejeita tier fora do registro', () => {
    expect(BatchBodySchema.safeParse({ ...base, videoEngine: 'seedance-2-spicy-image-to-video' }).success).toBe(false);
  });
});
```

- [ ] **Passo 3: Rodar para confirmar que falha**

Rodar: `npx vitest run tests/schemas.test.ts` → FAIL (módulos não existem).

- [ ] **Passo 4: Criar os schemas**

Criar `src/app/api/models/generate/schema.ts`:

```ts
import { z } from 'zod';
import { RegionSchema } from '@/types';
import { DEFAULT_IMAGE_ENGINE, IMAGE_ENGINE_IDS } from '@/lib/engines';

export const ModelGenerateBodySchema = z.object({
  region: RegionSchema,
  customPrompt: z.string().max(2000).optional(),
  refCount: z.number().int().min(1).max(5).default(3),
  imageEngine: z.enum(IMAGE_ENGINE_IDS).default(DEFAULT_IMAGE_ENGINE),
});
```

Criar `src/app/api/batches/schema.ts`:

```ts
import { z } from 'zod';
import { DEFAULT_IMAGE_ENGINE, DEFAULT_VIDEO_ENGINE, IMAGE_ENGINE_IDS, VIDEO_ENGINE_IDS } from '@/lib/engines';

export const BatchBodySchema = z.object({
  modelId: z.string().uuid(),
  productId: z.string().uuid(),
  videoCount: z.number().int().min(1).max(40),
  durationSeconds: z.union([z.literal(5), z.literal(10)]),
  imageEngine: z.enum(IMAGE_ENGINE_IDS).default(DEFAULT_IMAGE_ENGINE),
  videoEngine: z.enum(VIDEO_ENGINE_IDS).default(DEFAULT_VIDEO_ENGINE),
});
```

- [ ] **Passo 5: Ligar as rotas**

Em `src/app/api/models/generate/route.ts`: remover o `BodySchema` local (e os imports `z`/`RegionSchema` se ficarem sem uso), importar `ModelGenerateBodySchema` de `./schema`, e:

```ts
  const parsed = ModelGenerateBodySchema.safeParse(await req.json());
  // ...
  const { region, customPrompt, refCount, imageEngine } = parsed.data;
```

No insert do modelo, acrescentar a coluna:

```ts
    .insert({ name: persona.name, region, persona, status: 'generating_refs', image_engine: imageEngine })
```

E na chamada `generateImage` do loop, trocar `engineId: DEFAULT_IMAGE_ENGINE` por `engineId: imageEngine` (remover o import do default se ficar sem uso).

Em `src/app/api/batches/route.ts`: remover o `BodySchema` local, importar `BatchBodySchema` de `./schema`, e:

```ts
  const parsed = BatchBodySchema.safeParse(await req.json());
  // ...
  const { modelId, productId, videoCount, durationSeconds, imageEngine, videoEngine } = parsed.data;
```

O custo estimado passa a usar os motores escolhidos (remover imports de defaults se ficarem sem uso):

```ts
  const estimated = batchCostUsd(imageEngine, videoEngine, actualCount, durationSeconds);
```

E o insert do lote ganha as colunas:

```ts
    .insert({
      model_id: modelId, product_id: productId, video_count: actualCount,
      duration_seconds: durationSeconds, estimated_cost_usd: estimated,
      image_engine: imageEngine, video_engine: videoEngine,
    })
```

- [ ] **Passo 6: Rodar suíte completa + type-check**

Rodar: `npx vitest run` → PASS · `npx tsc --noEmit` → exit 0

- [ ] **Passo 7: Commit**

```bash
git add supabase/migrations/0002_engines.sql src/app/api/models/generate/schema.ts src/app/api/batches/schema.ts src/app/api/models/generate/route.ts src/app/api/batches/route.ts tests/schemas.test.ts
git commit -m "feat: rotas aceitam motores de imagem/video + migracao 0002"
```

---

### Tarefa 5: Cron por motor e remoção do teto de gasto

**Arquivos:**
- Modificar: `src/lib/queue.ts` (remove `dailyCostLimitUsd` e custo do allowance)
- Modificar: `src/app/api/cron/process-queue/route.ts` (usa engines do lote; remove rastreio de custo do despacho)
- Modificar: `src/app/(painel)/page.tsx` (remove "teto:" do card Gasto hoje)
- Modificar: `.env.example` (remove `DAILY_COST_LIMIT_USD`)
- Modificar: `.env.local` (remove `DAILY_COST_LIMIT_USD`)
- Teste: `tests/queue.test.ts` (reescrito)

**Interfaces:**
- Consome: `videoCostUsd`, `imageCostUsd` (T2); `generateImage`/`generateVideo` com `engineId` (T3); colunas `video_batches.image_engine`/`video_engine` (T4).
- Produz: `QueueLimits { dailyVideoLimit: number }`; `dispatchAllowance(state: { videosToday: number }, limits: QueueLimits): number`. O parâmetro `perVideoCostUsd` DEIXA DE EXISTIR.

- [ ] **Passo 1: Reescrever o teste da fila (vai falhar)**

Substituir TODO o conteúdo de `tests/queue.test.ts` por:

```ts
import { describe, it, expect } from 'vitest';
import { dispatchAllowance, nextAction } from '@/lib/queue';

const limits = { dailyVideoLimit: 40 };

describe('dispatchAllowance', () => {
  it('limita apenas pelo teto diário de vídeos', () => {
    expect(dispatchAllowance({ videosToday: 38 }, limits)).toBe(2);
    expect(dispatchAllowance({ videosToday: 0 }, limits)).toBe(40);
  });
  it('nunca retorna negativo', () => {
    expect(dispatchAllowance({ videosToday: 41 }, limits)).toBe(0);
  });
});

describe('nextAction', () => {
  it('queued compõe imagem; ready anima', () => {
    expect(nextAction({ status: 'queued', retry_count: 0, composed_image_url: null })).toEqual({ kind: 'compose' });
    expect(nextAction({ status: 'ready', retry_count: 0, composed_image_url: 'https://x/i.png' })).toEqual({ kind: 'animate' });
  });
  it('failed com retry disponível volta para a fase certa', () => {
    expect(nextAction({ status: 'failed', retry_count: 1, composed_image_url: null })).toEqual({ kind: 'retry', to: 'queued' });
    expect(nextAction({ status: 'failed', retry_count: 2, composed_image_url: 'https://x/i.png' })).toEqual({ kind: 'retry', to: 'ready' });
  });
  it('failed com 3 retries e estados terminais/em andamento ficam parados', () => {
    expect(nextAction({ status: 'failed', retry_count: 3, composed_image_url: null })).toEqual({ kind: 'none' });
    expect(nextAction({ status: 'generating', retry_count: 0, composed_image_url: 'u' })).toEqual({ kind: 'none' });
    expect(nextAction({ status: 'completed', retry_count: 0, composed_image_url: 'u' })).toEqual({ kind: 'none' });
  });
});
```

- [ ] **Passo 2: Rodar para confirmar que falha**

Rodar: `npx vitest run tests/queue.test.ts` → FAIL.

- [ ] **Passo 3: Ajustar `src/lib/queue.ts`**

Substituir as seções de limites (linhas 3-20) por:

```ts
export interface QueueLimits { dailyVideoLimit: number }

export function queueLimitsFromEnv(): QueueLimits {
  return { dailyVideoLimit: Number(process.env.DAILY_VIDEO_LIMIT ?? 40) };
}

// Sem teto de gasto por decisão de produto (spec 2026-07-31): o único
// limitador de despacho é a quantidade diária de vídeos.
export function dispatchAllowance(
  state: { videosToday: number },
  limits: QueueLimits,
): number {
  return Math.max(0, limits.dailyVideoLimit - state.videosToday);
}
```

(`nextAction`, `JobAction` e `MAX_RETRIES` permanecem como estão.)

- [ ] **Passo 4: Ajustar o cron `src/app/api/cron/process-queue/route.ts`**

1. No select de candidatos, o embed de `video_batches` passa a incluir os motores:

```ts
    .select('id,status,retry_count,composed_image_url,script,batch_id,video_batches(duration_seconds,image_engine,video_engine,model_id,product_id,models(persona,reference_image_urls),products(image_urls,title))')
```

2. O tipo do `batch` ganha os campos:

```ts
      const batch = job.video_batches as unknown as {
        duration_seconds: number;
        image_engine: string;
        video_engine: string;
        models: { persona: unknown; reference_image_urls: string[] };
        products: { image_urls: string[]; title: string };
      };
```

3. `perVideo` usa os motores do lote (substitui a versão com defaults da Tarefa 2; remover o import de `DEFAULT_IMAGE_ENGINE`/`DEFAULT_VIDEO_ENGINE` se ficar sem uso):

```ts
      const perVideo = videoCostUsd(batch.video_engine, batch.duration_seconds)
        + imageCostUsd(batch.image_engine);
```

4. O estado do dia perde o custo — substituir o bloco `const state = {...}` por:

```ts
  const state = { videosToday: dispatchedToday };
```

e a chamada `if (dispatchAllowance(state, limits, perVideo) <= 0) break;` por:

```ts
      if (dispatchAllowance(state, limits) <= 0) break;
```

e remover a linha `state.costTodayUsd += perVideo;` (a linha `state.videosToday += 1;` permanece). O reduce de `costTodayUsd` sobre `todayJobs` também sai; o select de `todayJobs` mantém `cost_usd,status` apenas se ainda usado pelo breaker — o breaker usa só `status`, então o select vira `.select('status')`.

5. As chamadas de geração usam os motores do lote:

```ts
        const { requestId } = await generateImage(cfg, {
          engineId: batch.image_engine,
          prompt: `${persona.image_prompt}. ${script.scene_description}. The person must look identical to the reference photos.`,
          imageUrls: refs,
        });
```

```ts
        const { requestId } = await generateVideo(cfg, {
          engineId: batch.video_engine,
          imageUrl: job.composed_image_url!,
          prompt: script.motion_prompt,
          durationSeconds: batch.duration_seconds,
        });
```

(`cost_usd: perVideo` continua sendo gravado no claim do animate — gasto vira informação, não trava.)

- [ ] **Passo 5: Dashboard sem teto**

Em `src/app/(painel)/page.tsx`, o card "Gasto hoje":

```tsx
          <div className="d">teto: {formatUsd(limits.dailyCostLimitUsd)}</div>
```

vira:

```tsx
          <div className="d">estimado pela tabela de preços</div>
```

- [ ] **Passo 6: Limpar envs**

Remover a linha `DAILY_COST_LIMIT_USD=20` de `.env.example` E de `.env.local`.

- [ ] **Passo 7: Rodar suíte completa + type-check**

Rodar: `npx vitest run` → PASS · `npx tsc --noEmit` → exit 0

- [ ] **Passo 8: Commit**

```bash
git add src/lib/queue.ts tests/queue.test.ts src/app/api/cron/process-queue/route.ts "src/app/(painel)/page.tsx" .env.example
git commit -m "feat: cron despacha pelo motor do lote e teto de gasto e removido"
```

(`.env.local` é gitignored — a edição vale localmente, sem commit.)

---

### Tarefa 6: UI — seletores de motor e projeção ao vivo

**Arquivos:**
- Modificar: `src/app/(painel)/models/ModelForm.tsx` (seletor de motor + projeção)
- Modificar: `src/app/(painel)/batches/new/BatchForm.tsx` (Passo 4 — Motores; custo ao vivo por motor)

**Interfaces:**
- Consome: `IMAGE_ENGINES`, `VIDEO_ENGINES`, `imageEngine`, `videoEngine`, defaults (T1); `imageCostUsd`, `videoCostUsd`, `batchCostUsd`, `modelRefsCostUsd`, `usdToBrl` (T2); campos `imageEngine`/`videoEngine` aceitos pelas rotas (T4).
- Produz: nada consumido por outras tarefas (folha).

- [ ] **Passo 1: `ModelForm.tsx` — seletor + projeção**

1. Imports novos no topo:

```ts
import { IMAGE_ENGINES, DEFAULT_IMAGE_ENGINE } from '@/lib/engines';
import { imageCostUsd, modelRefsCostUsd } from '@/lib/cost';
```

2. Estado novo junto aos existentes:

```ts
  const [engine, setEngine] = useState(DEFAULT_IMAGE_ENGINE);
```

3. No `fetch`, o body ganha o motor:

```ts
        body: JSON.stringify({ region, customPrompt: customPrompt || undefined, imageEngine: engine }),
```

4. Entre o campo de prompt personalizado e a linha de erro, inserir o seletor (segue o padrão visual do formulário — botões `.btn` em grupo):

```tsx
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
          <span className="sub" style={{ fontSize: 11.5 }}>
            3 referências ≈ US$ {modelRefsCostUsd(engine, 3).toFixed(2).replace('.', ',')} (estimativa)
          </span>
        </label>
```

- [ ] **Passo 2: `BatchForm.tsx` — Passo 4 e custo por motor**

1. Ajustar imports (substituem os da Tarefa 2):

```ts
import { batchCostUsd, imageCostUsd, usdToBrl, videoCostUsd } from '@/lib/cost';
import { DEFAULT_IMAGE_ENGINE, DEFAULT_VIDEO_ENGINE, IMAGE_ENGINES, VIDEO_ENGINES, imageEngine, videoEngine } from '@/lib/engines';
```

2. Estado novo:

```ts
  const [imgEngine, setImgEngine] = useState(DEFAULT_IMAGE_ENGINE);
  const [vidEngine, setVidEngine] = useState(DEFAULT_VIDEO_ENGINE);
```

3. Cálculos passam a usar os motores selecionados (substituem os da Tarefa 2):

```ts
  const perVideoUsd = videoCostUsd(vidEngine, duration);
  const videoLine = qty * perVideoUsd;
  const imageLine = qty * imageCostUsd(imgEngine);
  const total = useMemo(
    () => batchCostUsd(imgEngine, vidEngine, qty, duration),
    [imgEngine, vidEngine, qty, duration],
  );
```

4. O body do `fetch` ganha os motores:

```ts
        body: JSON.stringify({ modelId, productId, videoCount: qty, durationSeconds: duration, imageEngine: imgEngine, videoEngine: vidEngine }),
```

5. Após o card do "Passo 3", inserir o novo passo (mesmo padrão `.card.step` + `.choices` dos passos 1-2):

```tsx
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
```

6. No card de custo, as linhas com nomes hardcoded:

```tsx
          <span>Vídeo · Seedance 2.0 Mini</span>
```
vira
```tsx
          <span>Vídeo · {videoEngine(vidEngine).label}</span>
```
e
```tsx
          <span>Imagens · GPT Image 2</span>
```
vira
```tsx
          <span>Imagens · {imageEngine(imgEngine).label}</span>
```

7. Na nota de rodapé do card (`.cost-note`), acrescentar ao final do texto existente: ` Valores estimados pela tabela de preços da MuAPI.`

- [ ] **Passo 3: Rodar suíte completa + type-check + build**

Rodar: `npx vitest run` → PASS · `npx tsc --noEmit` → exit 0 · `npm run build` → exit 0

- [ ] **Passo 4: Commit**

```bash
git add "src/app/(painel)/models/ModelForm.tsx" "src/app/(painel)/batches/new/BatchForm.tsx"
git commit -m "feat: seletores de motor com projecao de custo ao vivo nos formularios"
```

---

### Tarefa 7: Verificação final e documentação

**Arquivos:**
- Modificar: `README.md` (envs e descrição dos motores)
- Modificar: `.jet/sdd/progress.md` (ledger)

**Interfaces:** consome tudo; não produz interface nova.

- [ ] **Passo 1: Atualizar `README.md`**

1. Remover a linha/menção a `DAILY_COST_LIMIT_USD` da tabela/lista de variáveis de ambiente.
2. Adicionar `ALLOWED_EMAILS` à lista caso ainda não esteja documentada.
3. Na seção de pipeline/modelos, atualizar a descrição para: geração de imagem via GPT Image 2 **ou** Nano Banana 2 (selecionável), vídeo via qualquer tier image-to-video do Seedance 2.0 (9 opções, Mini a VIP 4K), com custo estimado por geração via tabela local de preços.
4. Documentar a migração nova: rodar `supabase/migrations/0002_engines.sql` no SQL Editor de projetos já existentes.

- [ ] **Passo 2: Verificação completa (skill `jet-verificacao`)**

Rodar e colar as saídas reais:
- `npx vitest run` → esperado: 6+ arquivos, todos PASS
- `npx tsc --noEmit` → exit 0
- `npm run build` → exit 0, 14 rotas
- `git status --short` → limpo após commit

- [ ] **Passo 3: Atualizar o ledger `.jet/sdd/progress.md`**

Adicionar seção "Evolução multi-modelo (2026-07-31)" com o status de cada tarefa deste plano e a pendência operacional: "aplicar 0002_engines.sql no Supabase antes do primeiro lote com motores novos".

- [ ] **Passo 4: Commit final**

```bash
git add README.md .jet/sdd/progress.md
git commit -m "docs: README e ledger da evolucao multi-modelo"
```

---

## Pendência operacional (fora do código, feita pelo controlador)

1. Aplicar `supabase/migrations/0002_engines.sql` no SQL Editor do Supabase (via clipboard, como a 0001).
2. `git push` ao final.
3. No deploy da Vercel: NÃO configurar `DAILY_COST_LIMIT_USD` (não existe mais).
