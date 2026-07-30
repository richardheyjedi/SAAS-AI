# Plano de Implementação: AutoReelsAI MVP

> **Para quem for executar:** SUB-SKILL OBRIGATÓRIA: use a skill `jet-subagentes` para implementar este plano tarefa por tarefa, com um agente `jet-implementador` por tarefa e revisão via `jet-revisor` entre tarefas. Passos usam sintaxe de checkbox (`- [ ]`) para rastreamento.

**Objetivo:** Painel web (Next.js + Supabase) que cria modelos virtuais por região, cadastra produtos e gera lotes de vídeo sob demanda via MuAPI (GPT Image 2 + Seedance 2.0 Mini) com roteiros do Claude, custo exibido antes de confirmar e download manual dos vídeos.

**Arquitetura:** Pipeline semi-autônomo: LLM em 2 pontos (persona e roteiros), o resto determinístico. Fila em tabela Postgres (`video_jobs`) com máquina de estados `queued → composing → ready → generating → completed/failed`; despacho via Vercel Cron; resultados chegam por webhook da MuAPI; mídia no Supabase Storage (MVP guarda URLs retornadas pela MuAPI). Toda lógica de negócio vive em `src/lib/*` (pura, testada com Vitest); rotas de API são wrappers finos.

**Stack técnica:** Next.js 15 (App Router, TypeScript), Supabase (`@supabase/ssr`, Postgres, Auth), `@anthropic-ai/sdk` (Claude Haiku 4.5), Zod, Vitest. CSS próprio portado do mockup aprovado (sem Tailwind).

## Restrições globais

- Diretório raiz do repositório: `C:\Users\richa\AutoReelsAI` (os `.md` existentes permanecem).
- Modelos de geração: imagem `gpt-image-2-text-to-image`, vídeo Seedance 2.0 Mini image-to-video 720p — ambos via MuAPI. ⚠️ Os slugs/formato de payload da MuAPI estão isolados em `src/lib/muapi.ts` e DEVEM ser conferidos contra https://muapi.ai/docs antes do primeiro uso real.
- Custos fixos no código: vídeo US$ 0,08/segundo; imagem US$ 0,05; roteiros US$ 0,05 por lote; conversão exibida ≈ R$ 5,00/US$.
- LLM: `claude-haiku-4-5-20251001`, sempre com validação Zod da resposta.
- Guardrails: `DAILY_VIDEO_LIMIT` (default 40) e `DAILY_COST_LIMIT_USD` (default 20) lidos de env; cron nunca despacha acima deles; retry máximo 3 por job.
- Idioma da UI: Português. Textos de status: Rascunho / Em revisão / Na fila / Compondo / Gerando / Pronto / Falhou.
- Single user: qualquer usuário autenticado no Supabase tem acesso total (RLS `authenticated`).
- Node 20+. Testes com Vitest (`npm test` = `vitest run`).
- Commits frequentes; mensagens `feat:/test:/chore:` terminando com `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Estrutura de arquivos

```
C:\Users\richa\AutoReelsAI\
├── package.json / tsconfig.json / next.config.mjs / vitest.config.ts / vercel.json
├── .env.example  .gitignore  middleware.ts
├── supabase\migrations\0001_init.sql
├── src\
│   ├── types\index.ts            # Zod schemas + tipos (Persona, Script, rows)
│   ├── lib\
│   │   ├── cost.ts               # cálculo de custo (puro)
│   │   ├── muapi.ts              # client MuAPI + parser de webhook (isola endpoints)
│   │   ├── claude.ts             # generatePersona / generateScripts (injeção p/ teste)
│   │   ├── queue.ts              # máquina de estados + allowance (puro)
│   │   └── supabase\{server.ts,browser.ts}
│   ├── prompts\{persona.ts,video-scripts.ts}
│   └── app\
│       ├── layout.tsx  globals.css  page.tsx(dashboard)
│       ├── login\page.tsx
│       ├── models\page.tsx   products\page.tsx
│       ├── batches\new\page.tsx  batches\[id]\page.tsx
│       ├── videos\page.tsx
│       ├── components\{Sidebar.tsx,StatusPill.tsx,BatchForm.tsx}
│       └── api\
│           ├── models\generate\route.ts
│           ├── products\route.ts
│           ├── batches\route.ts  batches\[id]\approve\route.ts
│           ├── cron\process-queue\route.ts
│           └── webhooks\muapi\route.ts
└── tests\{cost,types,muapi,claude,queue}.test.ts
```

---

### Tarefa 1: Scaffold do projeto + tooling de teste

**Arquivos:**
- Criar: `package.json`, `tsconfig.json`, `next.config.mjs`, `vitest.config.ts`, `.gitignore`, `.env.example`, `src/app/layout.tsx`, `src/app/globals.css` (tokens do mockup), `src/app/page.tsx` (placeholder), `tests/smoke.test.ts`

**Interfaces:**
- Produz: projeto Next.js compilável; `npm test` roda Vitest; alias `@/*` → `src/*`.

- [ ] **Passo 1: Criar `package.json`**

```json
{
  "name": "autoreelsai",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.57.0",
    "@supabase/ssr": "^0.6.1",
    "@supabase/supabase-js": "^2.49.0",
    "next": "^15.3.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Passo 2: Criar `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Passo 3: Criar `next.config.mjs`, `vitest.config.ts`, `.gitignore`, `.env.example`**

`next.config.mjs`:
```js
/** @type {import('next').NextConfig} */
export default { images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] } };
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
});
```

`.gitignore`:
```
node_modules/
.next/
.env.local
.env
*.tsbuildinfo
```

`.env.example`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ANTHROPIC_API_KEY=sk-ant-...
MUAPI_API_KEY=...
MUAPI_BASE_URL=https://api.muapi.ai
APP_BASE_URL=http://localhost:3000
MUAPI_WEBHOOK_SECRET=troque-por-um-segredo
CRON_SECRET=troque-por-um-segredo
DAILY_VIDEO_LIMIT=40
DAILY_COST_LIMIT_USD=20
```

- [ ] **Passo 4: Criar layout mínimo e CSS de tokens**

`src/app/layout.tsx`:
```tsx
import './globals.css';
export const metadata = { title: 'AutoReelsAI' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
```

`src/app/globals.css` — copiar integralmente o bloco `:root{...}`, `@media (prefers-color-scheme: dark){...}` e resets (`*{box-sizing...}`, `body{...}`, `.btn`, `.pill`, `.card`, `.stats`, `.stat`, tabela, `.grid3`, `.lote`, `.cost`, `.vidgrid`, `.choices`, `.seg`, `.qty-row`, `.banner`, sidebar `aside/nav`) do mockup aprovado em `C:\Users\richa\AppData\Local\Temp\claude\C--WINDOWS-system32\c6cbb636-d16a-4f86-a42c-62ed773f8b3f\scratchpad\autoreelsai-mockup.html` (o agente deve ler esse arquivo e portar o CSS sem os estilos exclusivos de mockup como `.av-1..3`, que ficam também — são usados nos cards de modelo sem imagem).

`src/app/page.tsx` (placeholder desta tarefa; substituído na Tarefa 9):
```tsx
export default function Home() {
  return <main style={{ padding: 40 }}>AutoReelsAI — em construção</main>;
}
```

- [ ] **Passo 5: Escrever o teste smoke que falha**

`tests/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
describe('smoke', () => {
  it('vitest funciona com alias @', async () => {
    const mod = await import('@/types');
    expect(mod).toBeDefined();
  });
});
```

- [ ] **Passo 6: Rodar e confirmar que falha** — `npm install` e depois `npm test`. Esperado: FAIL (módulo `@/types` não existe).

- [ ] **Passo 7: Criar `src/types/index.ts` vazio-mínimo para o smoke passar**

```ts
export const APP_NAME = 'AutoReelsAI';
```

- [ ] **Passo 8: Rodar `npm test`** — Esperado: PASS. Rodar `npx tsc --noEmit`. Esperado: sem erros (gerar `next-env.d.ts` com `npx next build` só na Tarefa 10; se `tsc` reclamar de `next-env.d.ts` ausente, criar o arquivo com `/// <reference types="next" />` e `/// <reference types="next/image-types/global" />`).

- [ ] **Passo 9: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold Next.js + Vitest do AutoReelsAI"
```

---

### Tarefa 2: Schemas Zod e tipos de domínio

**Arquivos:**
- Modificar: `src/types/index.ts`
- Teste: `tests/types.test.ts`

**Interfaces:**
- Produz (exports exatos de `@/types`): `RegionSchema`, `Region` (`'br' | 'us' | 'us_latina' | 'custom'`), `PersonaSchema`, `Persona`, `ScriptSchema`, `Script`, `ScriptListSchema`, `JobStatus` (`'draft' | 'queued' | 'composing' | 'ready' | 'generating' | 'completed' | 'failed'`), `BatchStatus` (`'review' | 'approved' | 'done'`), `ModelStatus` (`'generating_refs' | 'pending_approval' | 'approved'`), `STATUS_LABEL: Record<JobStatus, string>`.

- [ ] **Passo 1: Escrever testes que falham** — `tests/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PersonaSchema, ScriptListSchema, STATUS_LABEL } from '@/types';

const persona = {
  name: 'Larissa', age: 26, region: 'br',
  appearance: 'mulher brasileira, 26 anos, cabelo castanho ondulado, sorriso aberto',
  personality: 'espontânea, energia alta, próxima do público',
  speech_style: 'português carioca com gírias leves',
  niche: 'moda feminina',
  image_prompt: 'ultra realistic photo of a 26 year old brazilian woman, wavy brown hair, natural light, phone camera style',
};

describe('PersonaSchema', () => {
  it('aceita persona válida', () => {
    expect(PersonaSchema.parse(persona).name).toBe('Larissa');
  });
  it('rejeita região desconhecida e idade fora da faixa', () => {
    expect(() => PersonaSchema.parse({ ...persona, region: 'jp' })).toThrow();
    expect(() => PersonaSchema.parse({ ...persona, age: 15 })).toThrow();
  });
});

describe('ScriptListSchema', () => {
  it('valida lista de roteiros', () => {
    const s = {
      title: 'Unboxing espontâneo',
      hook: 'gente, olha o que chegou',
      scene_description: 'a modelo segurando o vestido midi canelado, quarto iluminado, estilo selfie',
      motion_prompt: 'she holds up the dress, smiles and turns it to show the fabric, handheld phone camera',
    };
    expect(ScriptListSchema.parse({ scripts: [s] }).scripts).toHaveLength(1);
    expect(() => ScriptListSchema.parse({ scripts: [] })).toThrow();
  });
});

describe('STATUS_LABEL', () => {
  it('tem rótulo pt-BR para todo status', () => {
    expect(STATUS_LABEL.queued).toBe('Na fila');
    expect(STATUS_LABEL.completed).toBe('Pronto');
  });
});
```

- [ ] **Passo 2: Rodar `npm test`** — Esperado: FAIL (exports não existem).

- [ ] **Passo 3: Implementar `src/types/index.ts`**

```ts
import { z } from 'zod';

export const APP_NAME = 'AutoReelsAI';

export const RegionSchema = z.enum(['br', 'us', 'us_latina', 'custom']);
export type Region = z.infer<typeof RegionSchema>;

export const PersonaSchema = z.object({
  name: z.string().min(1),
  age: z.number().int().min(18).max(65),
  region: RegionSchema,
  appearance: z.string().min(10),
  personality: z.string().min(10),
  speech_style: z.string().min(5),
  niche: z.string().min(3),
  image_prompt: z.string().min(20),
});
export type Persona = z.infer<typeof PersonaSchema>;

export const ScriptSchema = z.object({
  title: z.string().min(3),
  hook: z.string().min(5),
  scene_description: z.string().min(20),
  motion_prompt: z.string().min(20),
});
export type Script = z.infer<typeof ScriptSchema>;
export const ScriptListSchema = z.object({ scripts: z.array(ScriptSchema).min(1) });

export type JobStatus = 'draft' | 'queued' | 'composing' | 'ready' | 'generating' | 'completed' | 'failed';
export type BatchStatus = 'review' | 'approved' | 'done';
export type ModelStatus = 'generating_refs' | 'pending_approval' | 'approved';

export const STATUS_LABEL: Record<JobStatus, string> = {
  draft: 'Rascunho',
  queued: 'Na fila',
  composing: 'Compondo',
  ready: 'Na fila',
  generating: 'Gerando',
  completed: 'Pronto',
  failed: 'Falhou',
};
```

- [ ] **Passo 4: Rodar `npm test`** — Esperado: PASS.
- [ ] **Passo 5: Commit** — `git add -A; git commit -m "feat: schemas Zod de persona, roteiro e status"`

---

### Tarefa 3: Cálculo de custo (`src/lib/cost.ts`)

**Arquivos:**
- Criar: `src/lib/cost.ts`
- Teste: `tests/cost.test.ts`

**Interfaces:**
- Produz: `VIDEO_USD_PER_SECOND = 0.08`, `IMAGE_USD = 0.05`, `SCRIPTS_USD_FLAT = 0.05`, `videoCostUsd(durationSeconds: number): number`, `batchCostUsd(videoCount: number, durationSeconds: number): number`, `usdToBrl(usd: number): number` (todas arredondadas a 2 casas).

- [ ] **Passo 1: Teste que falha** — `tests/cost.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { batchCostUsd, videoCostUsd, usdToBrl } from '@/lib/cost';

describe('custo', () => {
  it('vídeo de 5s custa 0.45 (0.40 vídeo + 0.05 imagem)', () => {
    expect(videoCostUsd(5)).toBe(0.45);
  });
  it('vídeo de 10s custa 0.85', () => {
    expect(videoCostUsd(10)).toBe(0.85);
  });
  it('lote de 20 vídeos de 5s custa 9.05 (inclui 0.05 de roteiros)', () => {
    expect(batchCostUsd(20, 5)).toBe(9.05);
  });
  it('lote de 1 vídeo de 5s custa 0.50', () => {
    expect(batchCostUsd(1, 5)).toBe(0.5);
  });
  it('conversão aproximada para BRL a 5.00', () => {
    expect(usdToBrl(9.05)).toBe(45.25);
  });
});
```

- [ ] **Passo 2: Rodar `npm test`** — Esperado: FAIL (módulo inexistente).
- [ ] **Passo 3: Implementar `src/lib/cost.ts`**

```ts
export const VIDEO_USD_PER_SECOND = 0.08;
export const IMAGE_USD = 0.05;
export const SCRIPTS_USD_FLAT = 0.05;
export const USD_TO_BRL = 5;

const round2 = (v: number) => Math.round(v * 100) / 100;

export function videoCostUsd(durationSeconds: number): number {
  return round2(durationSeconds * VIDEO_USD_PER_SECOND + IMAGE_USD);
}

export function batchCostUsd(videoCount: number, durationSeconds: number): number {
  return round2(videoCount * videoCostUsd(durationSeconds) + SCRIPTS_USD_FLAT);
}

export function usdToBrl(usd: number): number {
  return round2(usd * USD_TO_BRL);
}
```

- [ ] **Passo 4: Rodar `npm test`** — Esperado: PASS.
- [ ] **Passo 5: Commit** — `git add -A; git commit -m "feat: cálculo de custo de lote e vídeo"`

---

### Tarefa 4: Client MuAPI (`src/lib/muapi.ts`)

**Arquivos:**
- Criar: `src/lib/muapi.ts`
- Teste: `tests/muapi.test.ts`

**Interfaces:**
- Produz:
  - `interface MuApiConfig { apiKey: string; baseUrl: string; webhookUrl: string }`
  - `muApiConfigFromEnv(): MuApiConfig` (lê `MUAPI_API_KEY`, `MUAPI_BASE_URL`, `APP_BASE_URL` + `/api/webhooks/muapi`; lança `Error` se faltar chave)
  - `generateImage(cfg, input: { prompt: string; imageUrls?: string[] }): Promise<{ requestId: string }>`
  - `generateVideo(cfg, input: { imageUrl: string; prompt: string; durationSeconds: number }): Promise<{ requestId: string }>`
  - `WebhookPayloadSchema` e `parseWebhook(body: unknown): { requestId: string; status: 'completed' | 'failed'; outputUrl?: string; error?: string }`
- ⚠️ Slugs de endpoint em constantes no topo do arquivo (`IMAGE_MODEL_PATH`, `VIDEO_MODEL_PATH`) com comentário mandando conferir contra a doc da MuAPI.

- [ ] **Passo 1: Teste que falha** — `tests/muapi.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateImage, generateVideo, parseWebhook, type MuApiConfig } from '@/lib/muapi';

const cfg: MuApiConfig = { apiKey: 'k', baseUrl: 'https://api.test', webhookUrl: 'https://app/api/webhooks/muapi' };

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ request_id: 'req_1' }), { status: 200 })));
});

describe('generateImage', () => {
  it('faz POST no endpoint de imagem com api key e webhook', async () => {
    const r = await generateImage(cfg, { prompt: 'foto', imageUrls: ['https://x/1.png'] });
    expect(r.requestId).toBe('req_1');
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(call[0])).toContain('https://api.test');
    const init = call[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('k');
    const body = JSON.parse(String(init.body));
    expect(body.webhook_url).toBe(cfg.webhookUrl);
  });
  it('lança erro em resposta não-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 402 })));
    await expect(generateImage(cfg, { prompt: 'x' })).rejects.toThrow(/MuAPI 402/);
  });
});

describe('generateVideo', () => {
  it('envia image_url, prompt e duration', async () => {
    await generateVideo(cfg, { imageUrl: 'https://x/base.png', prompt: 'mexe', durationSeconds: 5 });
    const body = JSON.parse(String((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body));
    expect(body.image_url).toBe('https://x/base.png');
    expect(body.duration).toBe(5);
  });
});

describe('parseWebhook', () => {
  it('normaliza payload de sucesso', () => {
    const r = parseWebhook({ request_id: 'req_9', status: 'completed', outputs: ['https://cdn/v.mp4'] });
    expect(r).toEqual({ requestId: 'req_9', status: 'completed', outputUrl: 'https://cdn/v.mp4', error: undefined });
  });
  it('normaliza falha e rejeita payload sem request_id', () => {
    expect(parseWebhook({ request_id: 'r', status: 'failed', error: 'nsfw' }).error).toBe('nsfw');
    expect(() => parseWebhook({ status: 'completed' })).toThrow();
  });
});
```

- [ ] **Passo 2: Rodar `npm test`** — Esperado: FAIL.
- [ ] **Passo 3: Implementar `src/lib/muapi.ts`**

```ts
import { z } from 'zod';

// ⚠️ CONFERIR contra https://muapi.ai/docs antes do primeiro uso real:
// slugs de modelo e formato de payload podem divergir.
const IMAGE_MODEL_PATH = '/api/v1/gpt-image-2-text-to-image';
const VIDEO_MODEL_PATH = '/api/v1/seedance-2.0-mini-image-to-video';

export interface MuApiConfig { apiKey: string; baseUrl: string; webhookUrl: string }

export function muApiConfigFromEnv(): MuApiConfig {
  const apiKey = process.env.MUAPI_API_KEY;
  if (!apiKey) throw new Error('MUAPI_API_KEY ausente');
  const baseUrl = process.env.MUAPI_BASE_URL ?? 'https://api.muapi.ai';
  const appBase = process.env.APP_BASE_URL ?? 'http://localhost:3000';
  return { apiKey, baseUrl, webhookUrl: `${appBase}/api/webhooks/muapi` };
}

const SubmitResponseSchema = z.object({ request_id: z.string().min(1) });

async function submit(cfg: MuApiConfig, path: string, payload: Record<string, unknown>) {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey },
    body: JSON.stringify({ ...payload, webhook_url: cfg.webhookUrl }),
  });
  if (!res.ok) throw new Error(`MuAPI ${res.status}: ${await res.text()}`);
  const data = SubmitResponseSchema.parse(await res.json());
  return { requestId: data.request_id };
}

export function generateImage(cfg: MuApiConfig, input: { prompt: string; imageUrls?: string[] }) {
  return submit(cfg, IMAGE_MODEL_PATH, {
    prompt: input.prompt,
    ...(input.imageUrls?.length ? { image_urls: input.imageUrls } : {}),
  });
}

export function generateVideo(cfg: MuApiConfig, input: { imageUrl: string; prompt: string; durationSeconds: number }) {
  return submit(cfg, VIDEO_MODEL_PATH, {
    image_url: input.imageUrl,
    prompt: input.prompt,
    duration: input.durationSeconds,
    resolution: '720p',
  });
}

export const WebhookPayloadSchema = z.object({
  request_id: z.string().min(1),
  status: z.enum(['completed', 'failed']),
  outputs: z.array(z.string()).optional(),
  error: z.string().optional(),
});

export function parseWebhook(body: unknown) {
  const p = WebhookPayloadSchema.parse(body);
  return { requestId: p.request_id, status: p.status, outputUrl: p.outputs?.[0], error: p.error };
}
```

- [ ] **Passo 4: Rodar `npm test`** — Esperado: PASS.
- [ ] **Passo 5: Commit** — `git add -A; git commit -m "feat: client MuAPI com webhook parser"`

---

### Tarefa 5: Prompts + Claude (`src/lib/claude.ts`)

**Arquivos:**
- Criar: `src/prompts/persona.ts`, `src/prompts/video-scripts.ts`, `src/lib/claude.ts`
- Teste: `tests/claude.test.ts`

**Interfaces:**
- Consome: `PersonaSchema`, `ScriptListSchema`, `Persona`, `Script` de `@/types`.
- Produz:
  - `type ModelCaller = (system: string, user: string) => Promise<string>` (retorna texto da resposta)
  - `anthropicCaller: ModelCaller` (usa `@anthropic-ai/sdk`, modelo `claude-haiku-4-5-20251001`, `max_tokens: 4096`)
  - `generatePersona(input: { region: Region; customPrompt?: string }, call?: ModelCaller): Promise<Persona>`
  - `generateScripts(input: { persona: Persona; productTitle: string; productDescription: string; count: number; durationSeconds: number }, call?: ModelCaller): Promise<Script[]>`
  - Ambas extraem o primeiro bloco JSON da resposta (tolerante a ```json fences), validam com Zod e tentam 1 retry em falha de validação.
- `src/prompts/persona.ts` exporta `personaSystemPrompt: string` e `personaUserPrompt(input: { region: Region; customPrompt?: string }): string`; `src/prompts/video-scripts.ts` exporta `scriptsSystemPrompt: string` e `scriptsUserPrompt(input: { persona: Persona; productTitle: string; productDescription: string; count: number; durationSeconds: number }): string`.

- [ ] **Passo 1: Teste que falha** — `tests/claude.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { generatePersona, generateScripts } from '@/lib/claude';
import type { Persona } from '@/types';

const persona: Persona = {
  name: 'Larissa', age: 26, region: 'br',
  appearance: 'mulher brasileira, cabelo castanho ondulado, sorriso aberto',
  personality: 'espontânea, energia alta, tom próximo',
  speech_style: 'carioca com gírias leves',
  niche: 'moda feminina',
  image_prompt: 'ultra realistic photo of a 26yo brazilian woman, wavy brown hair, phone camera style',
};

describe('generatePersona', () => {
  it('parseia JSON com fence e valida com Zod', async () => {
    const call = vi.fn(async () => '```json\n' + JSON.stringify(persona) + '\n```');
    const p = await generatePersona({ region: 'br' }, call);
    expect(p.name).toBe('Larissa');
    expect(call).toHaveBeenCalledOnce();
  });
  it('faz 1 retry quando o primeiro JSON é inválido', async () => {
    const call = vi.fn()
      .mockResolvedValueOnce('{"name":"x"}')
      .mockResolvedValueOnce(JSON.stringify(persona));
    const p = await generatePersona({ region: 'br' }, call);
    expect(p.age).toBe(26);
    expect(call).toHaveBeenCalledTimes(2);
  });
  it('propaga erro após retry falho', async () => {
    const call = vi.fn(async () => 'não é json');
    await expect(generatePersona({ region: 'us' }, call)).rejects.toThrow();
  });
});

describe('generateScripts', () => {
  it('retorna a lista validada', async () => {
    const script = {
      title: 'Unboxing espontâneo', hook: 'gente, chegou!',
      scene_description: 'modelo segurando o vestido midi, luz natural, estilo selfie de quarto',
      motion_prompt: 'she lifts the dress, smiles, turns it around, handheld camera feel',
    };
    const call = vi.fn(async () => JSON.stringify({ scripts: [script, script] }));
    const scripts = await generateScripts(
      { persona, productTitle: 'Vestido midi', productDescription: 'canelado', count: 2, durationSeconds: 5 },
      call,
    );
    expect(scripts).toHaveLength(2);
    expect(scripts[0].title).toBe('Unboxing espontâneo');
  });
});
```

- [ ] **Passo 2: Rodar `npm test`** — Esperado: FAIL.
- [ ] **Passo 3: Implementar prompts**

`src/prompts/persona.ts`:
```ts
import type { Region } from '@/types';

export const personaSystemPrompt = `Você cria personas de creators virtuais para vídeos de TikTok Shop.
Responda SOMENTE com um objeto JSON, sem texto fora do JSON, com as chaves:
name, age (número), region, appearance, personality, speech_style, niche, image_prompt.
"image_prompt" deve ser em inglês, fotorrealista, estilo câmera de celular, descrevendo a pessoa de forma consistente e reutilizável (rosto, cabelo, idade, etnia, iluminação natural).
"region" deve ser exatamente o valor recebido no pedido.`;

const regionBrief: Record<Region, string> = {
  br: 'Mulher brasileira, 20-32 anos, tom espontâneo e caloroso, gírias brasileiras leves, estética de creator de TikTok Brasil.',
  us: 'Mulher americana, 20-32 anos, energia alta estilo GRWM/haul, inglês americano casual.',
  us_latina: 'Mulher latina nos EUA (ex: Miami), bilíngue inglês/espanhol, tom confiável de review.',
  custom: 'Siga fielmente a descrição personalizada fornecida.',
};

export function personaUserPrompt(input: { region: Region; customPrompt?: string }): string {
  return [
    `Crie uma persona para region="${input.region}".`,
    `Perfil regional: ${regionBrief[input.region]}`,
    input.customPrompt ? `Descrição personalizada do usuário (prioridade máxima): ${input.customPrompt}` : '',
    'Retorne apenas o JSON.',
  ].filter(Boolean).join('\n');
}
```

`src/prompts/video-scripts.ts`:
```ts
import type { Persona } from '@/types';

export const scriptsSystemPrompt = `Você roteiriza vídeos curtos de TikTok Shop estrelados por uma creator virtual.
Responda SOMENTE com JSON: {"scripts":[{"title","hook","scene_description","motion_prompt"}]}.
"scene_description": em inglês, descreve UMA imagem estática (a creator com o produto, cenário, enquadramento vertical 9:16, estilo foto de celular) — será usada para compor a imagem base.
"motion_prompt": em inglês, descreve o movimento a partir dessa imagem (gestos, expressão, câmera handheld) para um clipe curto.
"title" e "hook": no idioma da persona. Varie ângulos de venda entre os roteiros (unboxing, prova, antes/depois, 3 formas de usar, review sincera...). Nada de texto fora do JSON.`;

export function scriptsUserPrompt(input: {
  persona: Persona; productTitle: string; productDescription: string; count: number; durationSeconds: number;
}): string {
  const p = input.persona;
  return [
    `Persona: ${p.name}, ${p.age} anos, ${p.niche}. Aparência: ${p.appearance}. Personalidade: ${p.personality}. Fala: ${p.speech_style}.`,
    `Produto: ${input.productTitle} — ${input.productDescription}`,
    `Gere exatamente ${input.count} roteiros para clipes de ${input.durationSeconds} segundos.`,
    'Retorne apenas o JSON.',
  ].join('\n');
}
```

- [ ] **Passo 4: Implementar `src/lib/claude.ts`**

```ts
import Anthropic from '@anthropic-ai/sdk';
import { PersonaSchema, ScriptListSchema, type Persona, type Region, type Script } from '@/types';
import { personaSystemPrompt, personaUserPrompt } from '@/prompts/persona';
import { scriptsSystemPrompt, scriptsUserPrompt } from '@/prompts/video-scripts';

export type ModelCaller = (system: string, user: string) => Promise<string>;

export const anthropicCaller: ModelCaller = async (system, user) => {
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system,
    messages: [{ role: 'user', content: user }],
  });
  const block = msg.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') throw new Error('Resposta do Claude sem texto');
  return block.text;
};

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Resposta sem JSON');
  return JSON.parse(raw.slice(start, end + 1));
}

async function callValidated<T>(
  call: ModelCaller, system: string, user: string, validate: (data: unknown) => T,
): Promise<T> {
  try {
    return validate(extractJson(await call(system, user)));
  } catch {
    return validate(extractJson(await call(system, user + '\nATENÇÃO: a resposta anterior era inválida. Retorne apenas o JSON no formato pedido.')));
  }
}

export function generatePersona(
  input: { region: Region; customPrompt?: string }, call: ModelCaller = anthropicCaller,
): Promise<Persona> {
  return callValidated(call, personaSystemPrompt, personaUserPrompt(input), (d) => PersonaSchema.parse(d));
}

export async function generateScripts(
  input: { persona: Persona; productTitle: string; productDescription: string; count: number; durationSeconds: number },
  call: ModelCaller = anthropicCaller,
): Promise<Script[]> {
  const r = await callValidated(call, scriptsSystemPrompt, scriptsUserPrompt(input), (d) => ScriptListSchema.parse(d));
  return r.scripts;
}
```

- [ ] **Passo 5: Rodar `npm test`** — Esperado: PASS.
- [ ] **Passo 6: Commit** — `git add -A; git commit -m "feat: geração de persona e roteiros via Claude com validação Zod"`

---

### Tarefa 6: Máquina de estados da fila (`src/lib/queue.ts`)

**Arquivos:**
- Criar: `src/lib/queue.ts`
- Teste: `tests/queue.test.ts`

**Interfaces:**
- Consome: `JobStatus` de `@/types`.
- Produz:
  - `interface QueueLimits { dailyVideoLimit: number; dailyCostLimitUsd: number }`
  - `queueLimitsFromEnv(): QueueLimits` (defaults 40 / 20)
  - `dispatchAllowance(state: { videosToday: number; costTodayUsd: number }, limits: QueueLimits, perVideoCostUsd: number): number` — quantos jobs podem ser despachados agora (mínimo entre teto de vídeos restante e teto de custo restante; nunca negativo)
  - `type JobAction = { kind: 'compose' } | { kind: 'animate' } | { kind: 'retry'; to: 'queued' | 'ready' } | { kind: 'none' }`
  - `nextAction(job: { status: JobStatus; retry_count: number; composed_image_url: string | null }): JobAction` — `queued→compose`, `ready→animate`, `failed` com `retry_count < 3` → retry para a fase anterior (`queued` se não tem imagem composta, `ready` se tem), resto `none`.

- [ ] **Passo 1: Teste que falha** — `tests/queue.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { dispatchAllowance, nextAction } from '@/lib/queue';

const limits = { dailyVideoLimit: 40, dailyCostLimitUsd: 20 };

describe('dispatchAllowance', () => {
  it('limita pelo teto diário de vídeos', () => {
    expect(dispatchAllowance({ videosToday: 38, costTodayUsd: 0 }, limits, 0.45)).toBe(2);
  });
  it('limita pelo teto de custo', () => {
    expect(dispatchAllowance({ videosToday: 0, costTodayUsd: 19.2 }, limits, 0.45)).toBe(1);
  });
  it('nunca retorna negativo', () => {
    expect(dispatchAllowance({ videosToday: 41, costTodayUsd: 30 }, limits, 0.45)).toBe(0);
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

- [ ] **Passo 2: Rodar `npm test`** — Esperado: FAIL.
- [ ] **Passo 3: Implementar `src/lib/queue.ts`**

```ts
import type { JobStatus } from '@/types';

export interface QueueLimits { dailyVideoLimit: number; dailyCostLimitUsd: number }

export function queueLimitsFromEnv(): QueueLimits {
  return {
    dailyVideoLimit: Number(process.env.DAILY_VIDEO_LIMIT ?? 40),
    dailyCostLimitUsd: Number(process.env.DAILY_COST_LIMIT_USD ?? 20),
  };
}

export function dispatchAllowance(
  state: { videosToday: number; costTodayUsd: number },
  limits: QueueLimits,
  perVideoCostUsd: number,
): number {
  const byCount = limits.dailyVideoLimit - state.videosToday;
  const byCost = Math.floor((limits.dailyCostLimitUsd - state.costTodayUsd) / perVideoCostUsd);
  return Math.max(0, Math.min(byCount, byCost));
}

export type JobAction =
  | { kind: 'compose' }
  | { kind: 'animate' }
  | { kind: 'retry'; to: 'queued' | 'ready' }
  | { kind: 'none' };

const MAX_RETRIES = 3;

export function nextAction(job: {
  status: JobStatus; retry_count: number; composed_image_url: string | null;
}): JobAction {
  if (job.status === 'queued') return { kind: 'compose' };
  if (job.status === 'ready') return { kind: 'animate' };
  if (job.status === 'failed' && job.retry_count < MAX_RETRIES) {
    return { kind: 'retry', to: job.composed_image_url ? 'ready' : 'queued' };
  }
  return { kind: 'none' };
}
```

- [ ] **Passo 4: Rodar `npm test`** — Esperado: PASS.
- [ ] **Passo 5: Commit** — `git add -A; git commit -m "feat: máquina de estados e guarda de custo da fila"`

---

### Tarefa 7: Supabase — migration, clients e auth

**Arquivos:**
- Criar: `supabase/migrations/0001_init.sql`, `src/lib/supabase/server.ts`, `src/lib/supabase/browser.ts`, `middleware.ts`, `src/app/login/page.tsx`, `src/app/login/actions.ts`

**Interfaces:**
- Produz:
  - `createServerSupabase(): Promise<SupabaseClient>` (cookies do request, anon key — para páginas/rotas autenticadas)
  - `createServiceSupabase(): SupabaseClient` (service role — SÓ para cron e webhook)
  - `createBrowserSupabase(): SupabaseClient`
  - Tabelas: `models`, `products`, `video_batches`, `video_jobs`, `image_jobs` (refs de modelo)
  - `middleware.ts` redireciona não-autenticado para `/login` (exceto `/login`, `/api/webhooks/*`, `/api/cron/*`).

- [ ] **Passo 1: Escrever `supabase/migrations/0001_init.sql`**

```sql
create extension if not exists pgcrypto;

create table models (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region text not null check (region in ('br','us','us_latina','custom')),
  persona jsonb not null,
  reference_image_urls text[] not null default '{}',
  status text not null default 'generating_refs'
    check (status in ('generating_refs','pending_approval','approved')),
  created_at timestamptz not null default now()
);

create table image_jobs (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references models(id) on delete cascade,
  muapi_request_id text unique,
  image_url text,
  status text not null default 'generating' check (status in ('generating','completed','failed')),
  error text,
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  price_brl numeric(10,2),
  image_urls text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table video_batches (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references models(id),
  product_id uuid not null references products(id),
  video_count int not null check (video_count between 1 and 200),
  duration_seconds int not null check (duration_seconds in (5,10)),
  estimated_cost_usd numeric(10,2) not null,
  status text not null default 'review' check (status in ('review','approved','done')),
  created_at timestamptz not null default now()
);

create table video_jobs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references video_batches(id) on delete cascade,
  script jsonb not null,
  muapi_request_id text unique,
  composed_image_url text,
  video_url text,
  status text not null default 'draft'
    check (status in ('draft','queued','composing','ready','generating','completed','failed')),
  cost_usd numeric(10,2) not null default 0,
  error text,
  retry_count int not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index video_jobs_status_idx on video_jobs(status);
create index video_jobs_batch_idx on video_jobs(batch_id);

alter table models enable row level security;
alter table image_jobs enable row level security;
alter table products enable row level security;
alter table video_batches enable row level security;
alter table video_jobs enable row level security;

create policy "authenticated all" on models for all to authenticated using (true) with check (true);
create policy "authenticated all" on image_jobs for all to authenticated using (true) with check (true);
create policy "authenticated all" on products for all to authenticated using (true) with check (true);
create policy "authenticated all" on video_batches for all to authenticated using (true) with check (true);
create policy "authenticated all" on video_jobs for all to authenticated using (true) with check (true);
```

- [ ] **Passo 2: Implementar clients**

`src/lib/supabase/server.ts`:
```ts
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (all) => all.forEach(({ name, value, options }) => {
          try { cookieStore.set(name, value, options); } catch { /* RSC read-only */ }
        }),
      },
    },
  );
}

export function createServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
```

`src/lib/supabase/browser.ts`:
```ts
'use client';
import { createBrowserClient } from '@supabase/ssr';

export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Passo 3: Implementar `middleware.ts`** (raiz do repo)

```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (all) => {
          all.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          all.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user && request.nextUrl.pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/cron).*)'],
};
```

- [ ] **Passo 4: Login** — `src/app/login/actions.ts`:

```ts
'use server';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';

export async function signIn(formData: FormData) {
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get('email')),
    password: String(formData.get('password')),
  });
  if (error) redirect('/login?erro=1');
  redirect('/');
}
```

`src/app/login/page.tsx`:
```tsx
import { signIn } from './actions';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <form action={signIn} className="card" style={{ padding: 28, width: 340, display: 'grid', gap: 12 }}>
        <b style={{ fontSize: 18 }}>AutoReelsAI</b>
        {erro && <div className="pill p-err">E-mail ou senha inválidos</div>}
        <input name="email" type="email" required placeholder="E-mail" className="btn" style={{ fontWeight: 400 }} />
        <input name="password" type="password" required placeholder="Senha" className="btn" style={{ fontWeight: 400 }} />
        <button type="submit" className="btn primary">Entrar</button>
      </form>
    </main>
  );
}
```

- [ ] **Passo 5: Verificar** — `npx tsc --noEmit` sem erros; `npm test` continua PASS. (Migration é verificada de fato no Supabase na Tarefa 10.)
- [ ] **Passo 6: Commit** — `git add -A; git commit -m "feat: schema Supabase, clients e autenticação"`

---

### Tarefa 8: Rotas de API (pipeline completo)

**Arquivos:**
- Criar: `src/app/api/models/generate/route.ts`, `src/app/api/products/route.ts`, `src/app/api/batches/route.ts`, `src/app/api/batches/[id]/approve/route.ts`, `src/app/api/cron/process-queue/route.ts`, `src/app/api/webhooks/muapi/route.ts`

**Interfaces:**
- Consome: tudo das Tarefas 2–7 (`generatePersona`, `generateScripts`, `generateImage`, `generateVideo`, `parseWebhook`, `muApiConfigFromEnv`, `batchCostUsd`, `videoCostUsd`, `dispatchAllowance`, `nextAction`, `queueLimitsFromEnv`, clients Supabase).
- Produz endpoints:
  - `POST /api/models/generate` body `{ region, customPrompt?, refCount? (default 3) }` → cria model + dispara `refCount` image_jobs → `201 { modelId }`
  - `POST /api/products` body `{ title, description, priceBrl?, imageUrls }` → `201 { productId }`
  - `POST /api/batches` body `{ modelId, productId, videoCount, durationSeconds }` → gera roteiros (Claude), cria batch `review` + jobs `draft` → `201 { batchId, estimatedCostUsd }`
  - `POST /api/batches/[id]/approve` → jobs `draft→queued`, batch `review→approved` → `200`
  - `GET /api/cron/process-queue` (header `authorization: Bearer ${CRON_SECRET}`) → despacha conforme allowance → `200 { dispatched }`
  - `POST /api/webhooks/muapi?secret=...` → atualiza image_jobs/video_jobs → `200`

- [ ] **Passo 1: `src/app/api/models/generate/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { RegionSchema } from '@/types';
import { generatePersona } from '@/lib/claude';
import { generateImage, muApiConfigFromEnv } from '@/lib/muapi';
import { createServerSupabase } from '@/lib/supabase/server';

const BodySchema = z.object({
  region: RegionSchema,
  customPrompt: z.string().max(2000).optional(),
  refCount: z.number().int().min(1).max(5).default(3),
});

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { region, customPrompt, refCount } = parsed.data;

  const persona = await generatePersona({ region, customPrompt });
  const { data: model, error } = await supabase
    .from('models')
    .insert({ name: persona.name, region, persona, status: 'generating_refs' })
    .select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const cfg = muApiConfigFromEnv();
  for (let i = 0; i < refCount; i++) {
    const { requestId } = await generateImage(cfg, {
      prompt: `${persona.image_prompt} — reference shot ${i + 1}, same person, slightly different pose`,
    });
    await supabase.from('image_jobs').insert({ model_id: model.id, muapi_request_id: requestId });
  }
  return NextResponse.json({ modelId: model.id }, { status: 201 });
}
```

- [ ] **Passo 2: `src/app/api/products/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';

const BodySchema = z.object({
  title: z.string().min(2),
  description: z.string().default(''),
  priceBrl: z.number().positive().optional(),
  imageUrls: z.array(z.string().url()).default([]),
});

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const b = parsed.data;
  const { data, error } = await supabase
    .from('products')
    .insert({ title: b.title, description: b.description, price_brl: b.priceBrl, image_urls: b.imageUrls })
    .select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ productId: data.id }, { status: 201 });
}
```

- [ ] **Passo 3: `src/app/api/batches/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PersonaSchema } from '@/types';
import { generateScripts } from '@/lib/claude';
import { batchCostUsd } from '@/lib/cost';
import { createServerSupabase } from '@/lib/supabase/server';

const BodySchema = z.object({
  modelId: z.string().uuid(),
  productId: z.string().uuid(),
  videoCount: z.number().int().min(1).max(40),
  durationSeconds: z.union([z.literal(5), z.literal(10)]),
});

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { modelId, productId, videoCount, durationSeconds } = parsed.data;

  const [{ data: model }, { data: product }] = await Promise.all([
    supabase.from('models').select('persona,status').eq('id', modelId).single(),
    supabase.from('products').select('title,description').eq('id', productId).single(),
  ]);
  if (!model || !product) return NextResponse.json({ error: 'Modelo ou produto não encontrado' }, { status: 404 });
  if (model.status !== 'approved') return NextResponse.json({ error: 'Modelo ainda não aprovado' }, { status: 409 });

  const persona = PersonaSchema.parse(model.persona);
  const scripts = await generateScripts({
    persona, productTitle: product.title, productDescription: product.description,
    count: videoCount, durationSeconds,
  });

  const estimated = batchCostUsd(videoCount, durationSeconds);
  const { data: batch, error } = await supabase
    .from('video_batches')
    .insert({ model_id: modelId, product_id: productId, video_count: videoCount, duration_seconds: durationSeconds, estimated_cost_usd: estimated })
    .select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = scripts.map((script) => ({ batch_id: batch.id, script, status: 'draft' }));
  const { error: jobsError } = await supabase.from('video_jobs').insert(rows);
  if (jobsError) return NextResponse.json({ error: jobsError.message }, { status: 500 });

  return NextResponse.json({ batchId: batch.id, estimatedCostUsd: estimated }, { status: 201 });
}
```

- [ ] **Passo 4: `src/app/api/batches/[id]/approve/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { error } = await supabase.from('video_jobs').update({ status: 'queued' }).eq('batch_id', id).eq('status', 'draft');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await supabase.from('video_batches').update({ status: 'approved' }).eq('id', id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Passo 5: `src/app/api/cron/process-queue/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { PersonaSchema, ScriptSchema } from '@/types';
import { videoCostUsd } from '@/lib/cost';
import { generateImage, generateVideo, muApiConfigFromEnv } from '@/lib/muapi';
import { dispatchAllowance, nextAction, queueLimitsFromEnv } from '@/lib/queue';
import { createServiceSupabase } from '@/lib/supabase/server';

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  const supabase = createServiceSupabase();
  const cfg = muApiConfigFromEnv();
  const limits = queueLimitsFromEnv();

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const { data: todayJobs } = await supabase
    .from('video_jobs')
    .select('cost_usd,status')
    .gte('created_at', todayStart.toISOString())
    .in('status', ['composing', 'ready', 'generating', 'completed']);
  const state = {
    videosToday: todayJobs?.length ?? 0,
    costTodayUsd: (todayJobs ?? []).reduce((s, j) => s + Number(j.cost_usd), 0),
  };

  const { data: candidates } = await supabase
    .from('video_jobs')
    .select('id,status,retry_count,composed_image_url,script,batch_id,video_batches(duration_seconds,model_id,product_id,models(persona,reference_image_urls),products(image_urls,title))')
    .in('status', ['queued', 'ready', 'failed'])
    .order('created_at', { ascending: true })
    .limit(50);

  let dispatched = 0;
  for (const job of candidates ?? []) {
    const batch = job.video_batches as unknown as {
      duration_seconds: number;
      models: { persona: unknown; reference_image_urls: string[] };
      products: { image_urls: string[]; title: string };
    };
    const perVideo = videoCostUsd(batch.duration_seconds);
    if (dispatchAllowance(state, limits, perVideo) <= 0) break;

    const action = nextAction(job);
    if (action.kind === 'none') continue;
    if (action.kind === 'retry') {
      await supabase.from('video_jobs')
        .update({ status: action.to, retry_count: job.retry_count + 1, error: null })
        .eq('id', job.id);
      continue;
    }

    const script = ScriptSchema.parse(job.script);
    if (action.kind === 'compose') {
      const persona = PersonaSchema.parse(batch.models.persona);
      const refs = [batch.models.reference_image_urls[0], batch.products.image_urls[0]].filter(Boolean) as string[];
      const { requestId } = await generateImage(cfg, {
        prompt: `${persona.image_prompt}. ${script.scene_description}. The person must look identical to the reference photos.`,
        imageUrls: refs,
      });
      await supabase.from('video_jobs')
        .update({ status: 'composing', muapi_request_id: requestId })
        .eq('id', job.id);
    } else {
      const { requestId } = await generateVideo(cfg, {
        imageUrl: job.composed_image_url!,
        prompt: script.motion_prompt,
        durationSeconds: batch.duration_seconds,
      });
      await supabase.from('video_jobs')
        .update({ status: 'generating', muapi_request_id: requestId, cost_usd: perVideo })
        .eq('id', job.id);
      state.videosToday += 1;
      state.costTodayUsd += perVideo;
    }
    dispatched += 1;
  }
  return NextResponse.json({ dispatched });
}
```

- [ ] **Passo 6: `src/app/api/webhooks/muapi/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { parseWebhook } from '@/lib/muapi';
import { createServiceSupabase } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get('secret') !== process.env.MUAPI_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  let event;
  try { event = parseWebhook(await req.json()); }
  catch { return NextResponse.json({ error: 'Payload inválido' }, { status: 400 }); }

  const supabase = createServiceSupabase();

  const { data: imageJob } = await supabase
    .from('image_jobs').select('id,model_id').eq('muapi_request_id', event.requestId).maybeSingle();
  if (imageJob) {
    await supabase.from('image_jobs').update({
      status: event.status, image_url: event.outputUrl ?? null, error: event.error ?? null,
    }).eq('id', imageJob.id);
    if (event.status === 'completed' && event.outputUrl) {
      const { data: model } = await supabase.from('models')
        .select('reference_image_urls').eq('id', imageJob.model_id).single();
      const urls = [...(model?.reference_image_urls ?? []), event.outputUrl];
      const { count } = await supabase.from('image_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('model_id', imageJob.model_id).eq('status', 'generating');
      await supabase.from('models').update({
        reference_image_urls: urls,
        ...(count === 0 ? { status: 'pending_approval' } : {}),
      }).eq('id', imageJob.model_id);
    }
    return NextResponse.json({ ok: true });
  }

  const { data: videoJob } = await supabase
    .from('video_jobs').select('id,status').eq('muapi_request_id', event.requestId).maybeSingle();
  if (!videoJob) return NextResponse.json({ ok: true });

  if (event.status === 'failed') {
    await supabase.from('video_jobs').update({ status: 'failed', error: event.error ?? 'Falha na MuAPI' }).eq('id', videoJob.id);
  } else if (videoJob.status === 'composing') {
    await supabase.from('video_jobs').update({
      status: 'ready', composed_image_url: event.outputUrl ?? null, muapi_request_id: null,
    }).eq('id', videoJob.id);
  } else {
    await supabase.from('video_jobs').update({
      status: 'completed', video_url: event.outputUrl ?? null, completed_at: new Date().toISOString(),
    }).eq('id', videoJob.id);
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Passo 7: Verificar** — `npx tsc --noEmit` sem erros; `npm test` PASS.
- [ ] **Passo 8: Commit** — `git add -A; git commit -m "feat: rotas de API do pipeline (modelos, lotes, cron, webhook)"`

---

### Tarefa 9: UI do painel (conforme mockup aprovado)

**Arquivos:**
- Criar: `src/app/components/Sidebar.tsx`, `src/app/components/StatusPill.tsx`, `src/app/components/BatchForm.tsx`, `src/app/models/page.tsx`, `src/app/models/ModelForm.tsx`, `src/app/products/page.tsx`, `src/app/products/ProductForm.tsx`, `src/app/batches/new/page.tsx`, `src/app/batches/[id]/page.tsx`, `src/app/videos/page.tsx`
- Modificar: `src/app/page.tsx` (dashboard real), `src/app/layout.tsx` (shell com sidebar), `src/app/globals.css` (completar estilos das telas se algo faltou na Tarefa 1)

**Interfaces:**
- Consome: páginas server component leem via `createServerSupabase()`; `BatchForm` (client) usa `batchCostUsd`/`usdToBrl` de `@/lib/cost` para custo ao vivo e `fetch('/api/batches')` + `fetch('/api/batches/{id}/approve')`; `ModelForm` usa `fetch('/api/models/generate')`; `ProductForm` usa `fetch('/api/products')`.
- Layout: `layout.tsx` monta `<div class="app"><Sidebar/><main>{children}</main></div>`; a página de login NÃO recebe sidebar (usar route group: mover páginas do painel para `src/app/(painel)/` com `src/app/(painel)/layout.tsx` contendo a sidebar, e `login` fora do grupo — ajustar caminhos de arquivos acima de acordo: `src/app/(painel)/page.tsx`, `src/app/(painel)/models/page.tsx` etc. As rotas de API não mudam).

Conteúdo obrigatório por tela (fiel ao mockup):
1. **Dashboard** (`(painel)/page.tsx`): 4 stat cards — vídeos hoje (`video_jobs` com `status in (generating,completed)` e `created_at` hoje), na fila (`queued/ready/composing`), gasto hoje (soma `cost_usd` de hoje) vs `DAILY_COST_LIMIT_USD`, taxa de falha 7d (`failed / total`); tabela de últimos 10 lotes com modelo, produto, contagem `completed/video_count` e custo estimado; botão "+ Novo lote" → `/batches/new`.
2. **Modelos**: grid de cards (nome, região com bandeira — `br` 🇧🇷, `us` 🇺🇸, `us_latina` 🇺🇸·Latina —, nicho da persona, nº de refs, pill de status: `generating_refs`→"Gerando referências" `p-cyan`, `pending_approval`→"Aguardando aprovação" `p-warn` com botão "Aprovar" (server action que faz `update models set status='approved'`), `approved`→"Aprovada" `p-ok`); primeira imagem de referência como thumbnail (`<img>`) quando existir; `ModelForm` com select de região + textarea de prompt personalizado opcional + botão "Criar modelo".
3. **Produtos**: grid de cards (título, preço, nº de fotos, primeira foto como thumb) + `ProductForm` (título, descrição, preço, URLs de imagem separadas por vírgula — MVP sem upload de arquivo; nota na UI: "cole URLs públicas das fotos").
4. **Novo lote** (`batches/new`): `BatchForm` client component — selects de modelo (só `approved`) e produto, slider 1–40, seletor 5s/10s, painel de custo ao vivo idêntico ao mockup (`Vídeo · Seedance 2.0 Mini`, `Imagens · GPT Image 2`, `Roteiros · Claude`, total USD + ≈BRL), botão "Gerar N roteiros →" que faz POST `/api/batches` e redireciona para `/batches/{id}`.
5. **Revisão do lote** (`batches/[id]`): lista dos roteiros (title, hook, scene_description, motion_prompt) com custo estimado no topo e botão "Aprovar e gerar" → POST `/api/batches/{id}/approve` → redirect `/videos`; se batch já `approved`, mostrar progresso (contagens por status).
6. **Vídeos**: filtros por status (pills com contagem), grid de cards 9:16 — `completed` mostra `<video controls>` com `video_url` e link "Baixar" (`<a download href>`), `generating/composing` mostram pill animada, `failed` mostra erro e retry_count; banner de aviso sobre políticas do TikTok (texto do mockup).

- [ ] **Passo 1:** Implementar `Sidebar.tsx` (client component, `usePathname` para marcar ativo; itens: Dashboard `/`, Modelos `/models`, Produtos `/products`, Novo lote `/batches/new`, Vídeos `/videos`; logo AutoReelsAI com `logo-mark`; rodapé com gasto de hoje passado por prop opcional) e `StatusPill.tsx` (`{ status: JobStatus }` → span com classe `pill p-ok|p-cyan|p-warn|p-err|p-mut` e `STATUS_LABEL[status]`).
- [ ] **Passo 2:** Criar route group `(painel)` com layout contendo Sidebar; mover/atualizar dashboard.
- [ ] **Passo 3:** Implementar Modelos + ModelForm; Produtos + ProductForm (estados de loading/erro em pt-BR nos forms; `router.refresh()` após sucesso).
- [ ] **Passo 4:** Implementar BatchForm + página de revisão do lote.
- [ ] **Passo 5:** Implementar Vídeos.
- [ ] **Passo 6:** Verificar — `npx tsc --noEmit` sem erros; `npm test` PASS; `npm run dev` e navegar visualmente pelas telas com dados vazios (sem Supabase configurado as páginas devem renderizar estado vazio sem crashar — proteger com `?? []`).
- [ ] **Passo 7: Commit** — `git add -A; git commit -m "feat: painel completo (dashboard, modelos, produtos, lotes, vídeos)"`

---

### Tarefa 10: Deploy config, docs e verificação final

**Arquivos:**
- Criar: `vercel.json`, `README.md` (do repositório — instruções de setup; o `README-autoreelsai.md` de arquitetura permanece)
- Modificar: nenhum

- [ ] **Passo 1: `vercel.json`**

```json
{
  "crons": [{ "path": "/api/cron/process-queue", "schedule": "*/5 * * * *" }]
}
```

Nota: o cron da Vercel envia `authorization: Bearer ${CRON_SECRET}` automaticamente quando a env `CRON_SECRET` existe no projeto.

- [ ] **Passo 2: `README.md`** com: visão geral em 3 linhas, pré-requisitos, passo a passo de setup (criar projeto Supabase → rodar `supabase/migrations/0001_init.sql` no SQL Editor → criar usuário em Authentication → copiar `.env.example` para `.env.local` e preencher → `npm install` → `npm run dev`), deploy na Vercel (envs + cron), configuração do webhook na MuAPI (`https://SEU-APP/api/webhooks/muapi?secret=MUAPI_WEBHOOK_SECRET`), aviso sobre conferir slugs da MuAPI em `src/lib/muapi.ts`, e o fluxo de uso (criar modelo → aprovar → produto → lote → revisar → vídeos).
- [ ] **Passo 3: Verificação final** — rodar `npm test` (todos PASS), `npx tsc --noEmit` (sem erros), `npm run build` (build de produção OK). Registrar os outputs.
- [ ] **Passo 4: Commit** — `git add -A; git commit -m "chore: config de deploy e documentação de setup"`

---

## Autorrevisão (executada na escrita do plano)

1. **Cobertura do spec:** modelos por região/prompt ✅ (T5+T8), produto ✅ (T8/T9), lote sob demanda com custo antes de confirmar ✅ (T3+T9), fila+cron+webhook+retry+guardrails ✅ (T6+T8), download manual ✅ (T9), auth single-user ✅ (T7), custo/monitoramento no dashboard ✅ (T9). Fora do MVP (spec): publicação automática, voz/lipsync, retenção de storage.
2. **Placeholders:** nenhum "TBD"; único ponto aberto declarado é o formato exato da API MuAPI, isolado em `muapi.ts` com constantes e aviso — decisão consciente de arquitetura (interface própria), não placeholder.
3. **Consistência de tipos:** `videoCostUsd`/`batchCostUsd` (T3) usados em T8/T9; `nextAction`/`dispatchAllowance` (T6) usados em T8; `Persona`/`Script`/`STATUS_LABEL` (T2) usados em T5/T8/T9; statuses do SQL (T7) idênticos ao union `JobStatus` (T2). OK.
