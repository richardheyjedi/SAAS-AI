# AutoReelsAI

> Fábrica pessoal de vídeos de IA para TikTok Shop: cria modelos/creators virtuais por região, associa seus produtos e gera até 40 vídeos por dia prontos para postar.

![Porte](https://img.shields.io/badge/Porte-MVP-green)
![Status](https://img.shields.io/badge/Status-Em%20Desenvolvimento-blue)

---

## 📌 Visão Geral

Produzir conteúdo em volume é o gargalo de quem vende no TikTok Shop: cada produto precisa de dezenas de vídeos por semana para testar criativos, e contratar creators reais é caro e lento. O AutoReelsAI resolve isso com creators 100% virtuais e um pipeline de geração em lote.

O fluxo em alto nível: (1) você cria uma **modelo virtual** — via prompt personalizado ou gerada automaticamente por região (brasileira, americana), com aparência, tom de voz e estilo definidos por LLM; (2) cadastra um **produto** (camiseta, vestido, acessório de celular — qualquer coisa) com fotos; (3) você monta um **lote sob demanda**: escolhe a modelo X, o produto Y e quantos vídeos Z quer (5, 20, 40...) — o sistema mostra o custo estimado do lote, gera os Z roteiros com Claude, compõe a modelo com o produto e envia os jobs para a **MuAPI** (image-to-video); (4) os vídeos prontos chegam via webhook, ficam no painel para revisão e **download em lote** — a postagem no TikTok é manual no MVP.

O ponto técnico central é a **consistência da modelo**: cada creator tem 3–5 imagens de referência fixas geradas uma única vez, e todos os vídeos partem dessas imagens (image-to-video, nunca text-to-video puro). É isso que faz a mesma "pessoa" aparecer em centenas de vídeos.

**Porte:** 🟢 MVP (infra) / 🟡 Médio (custo de API)
**Budget estimado:** ~R$ 2.700–2.900/mês (~US$ 540–580) a 40 vídeos/dia de 5s — escala linear com volume × duração
**Modelos de geração:** GPT Image 2 (imagens) + Seedance 2.0 Mini (vídeos), ambos via MuAPI
**Prazo para MVP:** 1–2 semanas
**Público-alvo:** Uso próprio (single user)

---

## 🏗️ Arquitetura

```
Você (painel Next.js na Vercel)
  │
  ├─▶ 1. CRIAR MODELO
  │     Prompt personalizado OU região (BR/US)
  │       │
  │       ▼
  │     [Claude Haiku 4.5] → persona JSON (nome, aparência, tom, gírias)
  │       │
  │       ▼
  │     [MuAPI · GPT Image 2] → 3–5 imagens de referência
  │       │
  │       ▼
  │     ✋ VOCÊ APROVA a modelo → salva em `models` + Storage
  │
  ├─▶ 2. CADASTRAR PRODUTO
  │     Fotos + título + descrição → tabela `products` + Storage
  │
  └─▶ 3. GERAR LOTE (sob demanda: modelo X + produto Y + Z vídeos)
        │     Você escolhe a quantidade Z; o painel mostra o custo estimado
        │     do lote (Z × duração × US$ 0,08/s) antes de confirmar
        ▼
      [Claude Haiku 4.5] → Z roteiros/prompts de vídeo (JSON)
        │
        ▼
      ✋ VOCÊ REVISA os roteiros → cria Z jobs em `video_jobs` (status: queued)
        │
        ▼
      [Vercel Cron a cada 5 min] → pega jobs queued, respeitando teto diário
        │                          de segurança (vídeos e US$ — configurável)
        │
        ▼
      [MuAPI · GPT Image 2] → compõe modelo + produto (imagem base)
        │
        ▼
      [MuAPI · Seedance 2.0 Mini] image-to-video (imagem base + prompt de cena)
        │  geração assíncrona
        ▼
      [Webhook /api/webhooks/muapi] → baixa vídeo → Supabase Storage
        │                              status: completed (ou failed → retry ≤3×)
        ▼
      Painel: revisão, download em lote, métricas (custo/dia, falhas, fila)
        │
        ▼
      Você posta manualmente no TikTok Shop
```

### Tipo de Agente
- **Arquitetura:** Pipeline determinístico com LLM em 2 pontos (persona + roteiros) — não é agente conversacional
- **Autonomia:** Semi-autônomo — aprovação humana da modelo e dos roteiros; geração do lote roda sozinha
- **Guardrails de execução:** Limite de gasto diário configurável; pipeline pausa e notifica se >30% do lote falhar
- **Protocolo de ferramentas:** REST (MuAPI) + structured output (Claude)

---

## 🧱 Stack Técnico

### 🔒 Segurança & Governança
| Componente | Solução |
|-----------|---------|
| Autenticação | Supabase Auth (single user) |
| Gerenciamento de secrets | Vercel env vars + `.env.local` (nunca no client) |
| RBAC | Não (single user) |
| Proteção prompt injection | Sanitização básica de inputs; risco baixo (input só seu) |
| Conformidade | N/A formal — atenção às políticas de conteúdo IA do TikTok |

### 📊 Monitoramento & Avaliação
| Componente | Solução |
|-----------|---------|
| Observabilidade | Tabela `video_jobs` como fonte de verdade + painel próprio |
| Logging | Logs estruturados nas API routes; erro por job no banco |
| HITL | Sim — aprovação de modelo e roteiros antes do lote |
| Métricas principais | Vídeos/dia, taxa de falha, custo acumulado US$, tamanho da fila |

### 🧠 Conhecimento & RAG
| Componente | Solução |
|-----------|---------|
| RAG ativo | Não — dados estruturados em Postgres resolvem |

### 💾 Memória
| Componente | Solução |
|-----------|---------|
| Memória entre sessões | Sim, estruturada |
| Armazenamento | Supabase Postgres (perfis, produtos, histórico) + Storage (mídia) |

### ⚙️ Orquestração
| Componente | Solução |
|-----------|---------|
| Ferramenta | Código próprio: Next.js API routes + Vercel Cron + webhooks MuAPI |
| Tipo | Single pipeline (sem n8n, sem Redis — 40 jobs/dia é volume baixo) |
| Hospedagem | Vercel (serverless) |

### 🔧 Ferramentas & Integrações
| Integração | Propósito | Custo estimado |
|-----------|-----------|---------------|
| MuAPI · GPT Image 2 (`gpt-image-2-text-to-image`) | Imagens de referência da modelo + composição modelo+produto | ~US$ 0,03–0,06/imagem (~US$ 40–60/mês) |
| MuAPI · Seedance 2.0 Mini (image-to-video, 720p) | Geração dos vídeos | US$ 0,08/segundo (~US$ 0,40/vídeo de 5s → ~US$ 480/mês a 40/dia) |
| Claude API | Personas regionais + roteiros em lote | R$ 20–50/mês |
| Supabase Storage | Imagens de referência, fotos de produto, vídeos prontos | R$ 0 → R$ 125/mês |
| TikTok | Postagem manual no MVP (Content Posting API na v2) | R$ 0 |

### 🤖 LLM
| Componente | Solução |
|-----------|---------|
| Modelo principal | Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) |
| Fallback qualidade | Claude Sonnet 5 (`claude-sonnet-5`) |
| Provider | Anthropic |
| Output estruturado | Sim — Zod + JSON schema em toda resposta de LLM |

### 💻 Programação & Prompting
| Componente | Solução |
|-----------|---------|
| Linguagem | TypeScript ponta a ponta (Next.js App Router) |
| Frameworks | Next.js 15, Supabase JS, Zod, Anthropic SDK, Tailwind + shadcn/ui |
| Prompting | Few-shot (exemplos de personas BR/US) + JSON estruturado |
| Versionamento de prompts | Sim — `src/prompts/*.ts` no git |

---

## 📂 Estrutura do Projeto

```
autoreelsai/
├── src/
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   ├── models/            # CRUD de modelos virtuais + aprovação
│   │   │   ├── products/          # CRUD de produtos
│   │   │   ├── batches/           # Criação e revisão de lotes de vídeo
│   │   │   └── videos/            # Galeria, download em lote, métricas
│   │   └── api/
│   │       ├── models/generate/   # Claude persona → MuAPI imagens de referência
│   │       ├── batches/           # Gera roteiros em lote (Claude)
│   │       ├── cron/process-queue/# Vercel Cron: despacha jobs p/ MuAPI + retries
│   │       └── webhooks/muapi/    # Recebe vídeo pronto → Storage → status
│   ├── lib/
│   │   ├── muapi.ts               # Client MuAPI (interface abstrata p/ trocar provider)
│   │   ├── anthropic.ts           # Client Claude + validação Zod
│   │   ├── supabase/              # Clients server/browser
│   │   └── cost-guard.ts          # Limite de gasto diário
│   ├── prompts/
│   │   ├── persona.ts             # Prompt de persona por região (BR/US) + few-shots
│   │   └── video-scripts.ts       # Prompt de roteiros/prompts de vídeo em lote
│   └── types/                     # Tipos compartilhados (Model, Product, VideoJob)
├── supabase/
│   └── migrations/                # Schema: models, products, video_batches, video_jobs
├── .env.example
└── package.json
```

### Schema principal (Supabase)

```sql
models        (id, name, region, persona_json, reference_image_urls[], status, created_at)
products      (id, title, description, image_urls[], created_at)
video_batches (id, model_id, product_id, video_count,          -- Z: quantidade escolhida por você no lote
               estimated_cost_usd, status, created_at)
video_jobs    (id, batch_id, script_json, muapi_request_id, status,        -- queued | generating | completed | failed
               video_url, cost_usd, error, retry_count, created_at, completed_at)
```

---

## 🚀 Como Rodar

### Pré-requisitos
- Node.js 20+
- Conta Supabase (free tier)
- Conta MuAPI com API key ([muapi.ai](https://muapi.ai))
- API key da Anthropic
- Conta Vercel (deploy + cron)

### Instalação

```bash
# 1. Clone e instale
git clone <URL-DO-REPO>
cd autoreelsai
npm install

# 2. Configure as variáveis de ambiente
cp .env.example .env.local
# Edite o .env.local com suas chaves

# 3. Suba o schema no Supabase
npx supabase db push

# 4. Rode em desenvolvimento
npm run dev
```

### Deploy

```bash
vercel deploy --prod
# Configure o cron no vercel.json:
# { "crons": [{ "path": "/api/cron/process-queue", "schedule": "*/5 * * * *" }] }
# Registre a URL do webhook na MuAPI: https://<seu-app>.vercel.app/api/webhooks/muapi
```

---

## 🔑 Variáveis de Ambiente

```env
# LLM
ANTHROPIC_API_KEY=sk-ant-...              # Personas e roteiros

# Geração de vídeo/imagem
MUAPI_API_KEY=...                         # MuAPI (muapi.ai)
MUAPI_WEBHOOK_SECRET=...                  # Validação de assinatura do webhook

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...             # Só no server (API routes/cron)

# Guardrails (tetos de segurança — a quantidade real é escolhida por lote)
DAILY_VIDEO_LIMIT=40                      # Teto de vídeos/dia; fila segura o excedente p/ o dia seguinte
DAILY_COST_LIMIT_USD=20                   # Pipeline pausa se o gasto do dia exceder
CRON_SECRET=...                           # Protege o endpoint do cron
```

---

## 💰 Custos Estimados

| Componente | Ferramenta | Custo/mês |
|-----------|-----------|-----------|
| Vídeo | Seedance 2.0 Mini · 40/dia × 5s × US$ 0,08/s | US$ ~480 (R$ ~2.400) |
| Imagem | GPT Image 2 · composições modelo+produto | US$ 40–60 (R$ 200–300) |
| LLM | Claude Haiku 4.5 | R$ 20–50 |
| Banco/Auth/Storage | Supabase | R$ 0 (free) → R$ 125 (Pro) |
| Hosting + Cron | Vercel | R$ 0 (free) → R$ 100 (Pro) |
| **TOTAL ESTIMADO** | | **~R$ 2.700–2.900/mês** no cenário máximo (40 vídeos/dia de 5s) |

> 💡 **O custo é sob demanda** — você escolhe quantos vídeos gerar em cada lote, então o gasto acompanha o uso real. Regra de bolso: **cada vídeo de 5s custa ~US$ 0,45** (Seedance US$ 0,40 + imagem de composição ~US$ 0,05). Um lote de 20 vídeos ≈ US$ 9. O painel mostra o custo estimado antes de você confirmar cada lote.
>
> ⚠️ **Correção da premissa inicial:** US$ 0,03 é o preço por IMAGEM do GPT Image 2 — não por vídeo. O Seedance 2.0 Mini custa US$ 0,08/segundo na MuAPI; vídeo de 10s custa o dobro do de 5s. **Valide com um lote de teste antes de escalar.**

---

## 🗺️ Roadmap

### MVP (Fase 1 — semanas 1–2)
- [ ] Lote de teste na MuAPI: 3–5 imagens (GPT Image 2) + 3 vídeos (Seedance 2.0 Mini i2v) — validar custo real por vídeo e consistência visual da modelo (fazer PRIMEIRO)
- [ ] Bootstrap Next.js + Supabase + Auth + schema
- [ ] Gerador de personas (BR/US) + imagens de referência + fluxo de aprovação
- [ ] Cadastro de produtos com fotos
- [ ] Pipeline de lote: roteiros → fila → MuAPI → webhook → Storage
- [ ] Painel: galeria, download em lote, métricas de custo/falha, limite diário

### v1.0 (Fase 2)
- [ ] Agendamento/publicação automática via TikTok Content Posting API
- [ ] Voz da modelo (TTS por região) + lipsync
- [ ] Feedback loop: importar métricas de views/vendas por vídeo e favorecer os estilos que performam
- [ ] Mais regiões (latina, europeia, asiática)

### Futuro
- [ ] Multi-tenant + billing (Stripe) para vender como SaaS
- [ ] A/B testing automático de criativos
- [ ] Migração de storage para Cloudflare R2 se o volume crescer

---

## ⚠️ Limitações Conhecidas

- Postagem no TikTok é manual no MVP (download em lote)
- Vídeos sem áudio/voz sincronizada na primeira versão (depende do modelo de vídeo escolhido na MuAPI)
- Consistência da modelo depende da qualidade do image-to-video do modelo escolhido — validar na semana 1
- Free tier do Supabase (1 GB storage) exige política de retenção: apagar vídeos já postados após alguns dias

---

## 📖 Referências

- [MuAPI — Docs](https://muapi.ai/docs/cli)
- [MuAPI — Seedance 2 (preços por tier)](https://muapi.ai/seedance-2.5)
- [MuAPI — Playground de modelos](https://muapi.ai/playground)
- [Anthropic API — Docs](https://docs.anthropic.com)
- [Supabase — Docs](https://supabase.com/docs)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- [TikTok Content Posting API](https://developers.tiktok.com/doc/content-posting-api-get-started) (para a v2)

---

*Gerado com Agent Architect — JET Digital | [wearejet.digital](https://wearejet.digital)*
