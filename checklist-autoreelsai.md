# ✅ Checklist de Decisões — AutoReelsAI

> **Gerado em:** 30/07/2026
> **Porte do projeto:** 🟢 MVP (infra simples) / 🟡 Médio (custo de API)
> **Budget estimado:** sob demanda — ~US$ 0,45 por vídeo de 5s; teto de ~US$ 540–580/mês (R$ 2.700–2.900) no cenário máximo de 40 vídeos/dia
> **Gerado com:** Agent Architect — JET Digital

---

## 📋 Contexto do Projeto

| Campo | Valor |
|-------|-------|
| **Função principal** | Criar modelos/creators de IA por região (brasileira, americana), associar produtos do TikTok Shop e gerar lotes de vídeo sob demanda — você escolhe modelo X + produto Y + Z vídeos (dimensionado para até ~40/dia) — para postagem manual |
| **Público-alvo** | Uso próprio (single user) — sem multi-tenant, sem billing |
| **Prazo para MVP** | 1–2 semanas |
| **Stack preferida** | Next.js/Node + Supabase (TypeScript ponta a ponta) |
| **Memória entre sessões** | SIM — estruturada (perfis de modelos, produtos, histórico de vídeos) |
| **Integrações necessárias** | MuAPI — **GPT Image 2** (imagens) e **Seedance 2.0 Mini** (vídeos), Claude API (personas e roteiros), Supabase Storage |
| **Tipo de agente** | Pipeline semi-autônomo (não é agente conversacional) |

---

## 🗂️ Decisões por Camada

### Camada 01 — Segurança & Governança ✅ Obrigatória

- [x] **Método de autenticação:** Supabase Auth (single user, e-mail + senha)
- [x] **Gerenciamento de secrets:** Variáveis de ambiente (Vercel env vars + `.env.local`) — chaves nunca expostas no front
- [x] **RBAC necessário:** NÃO (single user)
- [x] **Proteção contra prompt injection:** Baixo risco (input vem só de você); sanitização básica dos campos de prompt personalizado
- [x] **Filtragem de output:** Validação de JSON schema nas respostas do LLM
- [x] **Conformidade:** Sem exigência formal (uso próprio). ⚠️ Atenção às políticas do TikTok sobre conteúdo gerado por IA — marcar vídeos como AI-generated quando exigido
- **Ferramenta(s) escolhida(s):** Supabase Auth + env vars — 💰 Custo: R$ 0/mês

---

### Camada 02 — Monitoramento & Avaliação ✅ Obrigatória

- [x] **Ferramenta de observabilidade:** Tabela `video_jobs` no Supabase como fonte de verdade (status, custo, erro, tempos por etapa)
- [x] **Estratégia de logging:** Logs estruturados nas API routes + registro por job no banco
- [x] **HITL (humano no circuito):** SIM — aprovação da modelo gerada, revisão dos roteiros e **confirmação do custo estimado do lote** (Z × duração × US$ 0,08/s, exibido antes de rodar)
- [x] **Métricas a rastrear:** Vídeos gerados/dia, taxa de falha da MuAPI, custo acumulado (US$), tempo médio de geração, fila pendente
- [x] **Red team / testes adversariais:** Não necessário no MVP
- **Ferramenta(s) escolhida(s):** Painel próprio no app + Supabase — 💰 Custo: R$ 0/mês

---

### Camada 03 — Conhecimento & RAG ⚡ Não necessária

- [x] **RAG necessário:** NÃO — catálogo de produtos e perfis de modelos são dados estruturados; Postgres relacional resolve. Reavaliar só se no futuro quiser buscar "vídeos parecidos que performaram bem" semanticamente.

---

### Camada 04 — Gerenciamento de Memória ⚡ Obrigatória (estruturada)

- [x] **Memória entre sessões necessária:** SIM
- [x] **Tipo de memória:** Longo prazo, estruturada (sem vector store)
- [x] **O que será memorizado:** Perfis das modelos (prompt de persona, região, imagens de referência), produtos cadastrados, histórico completo de vídeos, prompts/estilos que performaram melhor
- [x] **Solução de armazenamento:** PostgreSQL (Supabase) + Supabase Storage para imagens/vídeos
- [x] **Guardrails de memória:** Constraint de unicidade por modelo/produto; soft delete
- **Ferramenta(s) escolhida(s):** Supabase (Postgres + Storage) — 💰 Custo: R$ 0 (free tier) → R$ 125/mês (Pro, quando o storage crescer)

---

### Camada 05 — Orquestração & Automação ✅ Obrigatória (coração do sistema)

- [x] **Single ou multi-agente:** SINGLE (pipeline determinístico com LLM em pontos específicos)
- [x] **Fluxo principal mapeado:** SIM — lote sob demanda (você escolhe modelo X + produto Y + Z vídeos) → fila em tabela → MuAPI assíncrona → webhook de conclusão → storage → painel (ver README)
- [x] **Ferramenta de orquestração:** Código próprio (Next.js API routes + Vercel Cron) — sem n8n, sem Redis/BullMQ (40 vídeos/dia é volume baixo)
- [x] **Hospedagem da orquestração:** Vercel (serverless) — webhooks da MuAPI recebem os resultados; cron a cada 5 min processa fila e retries
- **Ferramenta(s) escolhida(s):** Vercel Cron + webhooks MuAPI — 💰 Custo: R$ 0 (free tier) → R$ 100/mês (Vercel Pro se precisar de crons mais frequentes)

---

### Camada 06 — Uso de Ferramentas & Integração ✅ Obrigatória

- [x] **Integrações necessárias:** MuAPI (REST) — **GPT Image 2** (`gpt-image-2-text-to-image`) para criar a modelo e compor produto (~US$ 0,03–0,06/imagem) + **Seedance 2.0 Mini** (image-to-video, 720p, US$ 0,08/segundo) para os vídeos; Claude API; Supabase Storage
- [x] **Protocolo de tool use:** REST direto (MuAPI) + Function calling/structured output (Claude)
- [x] **Execução de código:** NÃO
- [x] **Navegação na web:** NÃO
- [x] **Leitura/escrita de arquivos:** SIM — upload de fotos de produto, download de vídeos prontos
- [x] **Publicação no TikTok:** Manual (download em lote pelo painel). Automação via TikTok Content Posting API fica para v2
- **Custo estimado das integrações externas:** MuAPI ~US$ 520–540/mês — vídeo: 40/dia × 5s × US$ 0,08/s = US$ 16/dia (~US$ 480/mês); imagens de composição: ~40/dia × US$ 0,03–0,05 (~US$ 40–60/mês). ⚠️ Vídeo de 10s dobra o custo (~US$ 960/mês)

---

### Camada 07 — LLMs & APIs ✅ Obrigatória

- [x] **Modelo principal:** Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) — geração de personas regionais e roteiros/prompts de vídeo em lote
- [x] **Modelo de fallback:** Claude Sonnet 5 (`claude-sonnet-5`) para personas mais elaboradas, se a qualidade do Haiku não bastar
- [x] **Provider:** Anthropic
- [x] **Roteamento por complexidade:** NÃO (volume pequeno, não compensa)
- [x] **Output estruturado (JSON schema):** SIM — persona e roteiros sempre validados com Zod
- [x] **Rate limiting e retry implementados:** SIM — retry com backoff exponencial na MuAPI e na Anthropic
- **Custo estimado mensal de LLM:** R$ 20–50/mês

---

### Camada 08 — Conceitos de IA & Agentes ✅ Obrigatória

- [x] **Tipo de agente:** Semi-autônomo — você aprova modelo e roteiros; a geração dos vídeos em lote roda sozinha
- [x] **Arquitetura:** Pipeline determinístico (não ReAct) — LLM em 2 pontos: (1) gerador de persona, (2) gerador de roteiros em lote
- [x] **Protocolo:** Function calling / structured output (sem MCP no MVP)
- [x] **Política de decisão autônoma:** Após aprovação do lote, o pipeline gera, faz retry (máx. 3×) e salva sem intervenção
- [x] **Política de escalamento humano:** Pausa e notifica se taxa de falha do lote > 30% ou custo diário exceder limite configurado
- [x] **Decisão arquitetural crítica — consistência da modelo:** Gerar 3–5 imagens de referência da modelo uma única vez (text-to-image), salvar no perfil, e usar **image-to-video** em todos os vídeos. Para produto: compor imagem da modelo com o produto (image edit/try-on) antes de animar. Nunca text-to-video puro.
- [x] **Colaboração multiagente:** NÃO

---

### Camada 09 — Programação & Prompting ✅ Obrigatória

- [x] **Linguagem principal:** TypeScript (Next.js App Router, ponta a ponta)
- [x] **Linguagem secundária:** Nenhuma
- [x] **Estratégia de prompting:** Few-shot (exemplos de personas BR/US bem construídas) + output estruturado JSON
- [x] **Gerenciamento de contexto:** Janela simples — cada chamada é curta e independente
- [x] **Versionamento de prompts:** SIM — prompts em arquivos `.ts` no repositório, versionados no git
- [x] **Testes de prompts planejados:** Informal no MVP — comparar 2–3 variantes de prompt de vídeo e registrar qual estilo performa melhor no TikTok

---

## 💰 Resumo de Custos

| Categoria | Ferramenta | Custo/mês |
|-----------|-----------|-----------|
| Vídeo | MuAPI · Seedance 2.0 Mini (40/dia × 5s × US$ 0,08/s) | US$ ~480 (R$ ~2.400) |
| Imagem | MuAPI · GPT Image 2 (composições modelo+produto) | US$ 40–60 (R$ 200–300) |
| LLM | Claude Haiku 4.5 | R$ 20–50 |
| Segurança | Supabase Auth + env vars | R$ 0 |
| Monitoramento | Painel próprio + Supabase | R$ 0 |
| Memória/Banco | Supabase free tier | R$ 0 (→ R$ 125 no Pro) |
| Orquestração | Vercel Cron + webhooks | R$ 0 |
| Infraestrutura | Vercel free tier | R$ 0 (→ R$ 100 no Pro) |
| **TOTAL ESTIMADO** | | **~R$ 2.700–2.900/mês** no cenário máximo (40 vídeos/dia de 5s) |

> 💡 **O custo é sob demanda:** a quantidade é escolhida por lote (modelo X + produto Y + Z vídeos), então o gasto acompanha o uso. Regra de bolso: ~US$ 0,45 por vídeo de 5s (lote de 20 ≈ US$ 9). Alavancas: vídeos de 5s (10s dobra o custo) e, se necessário, modelo mais barato (ex: Wan) para parte do volume.

---

## ⚠️ Riscos Identificados

- [ ] **Custo de vídeo muito acima da estimativa inicial:** a premissa de US$ 0,03/vídeo não se confirmou — esse é o preço por IMAGEM do GPT Image 2. O Seedance 2.0 Mini custa US$ 0,08/segundo na MuAPI (~US$ 0,40 por vídeo de 5s), levando o total a ~R$ 2.700/mês a 40 vídeos/dia. Confirmar com lote de teste real e decidir: reduzir volume, encurtar vídeos ou aceitar o custo (se cada vídeo gerar venda, o ROI pode fechar fácil).
- [ ] **Consistência visual da modelo:** É o risco técnico nº 1 do produto. Se a modelo mudar de rosto entre vídeos, o perfil TikTok perde credibilidade. Mitigação: imagens de referência fixas + image-to-video + testar consistência do modelo de vídeo escolhido logo na semana 1.
- [ ] **Storage de vídeo cresce rápido:** 40 vídeos/dia ≈ 1.200/mês. Free tier do Supabase (1 GB) estoura em dias. Política de retenção: apagar vídeos já baixados/postados após X dias, ou migrar para Cloudflare R2 (mais barato).
- [ ] **Políticas do TikTok:** Conteúdo de IA representando pessoas realistas pode exigir rótulo de "AI-generated"; contas com 40 posts/dia podem ser sinalizadas como spam. Distribuir posts ao longo do dia e acompanhar as diretrizes do TikTok Shop.
- [ ] **Dependência de API sem SLA:** MuAPI é agregador — se um modelo sair do catálogo ou mudar de preço, o pipeline para. Abstrair o provider numa interface para trocar de agregador (fal.ai, Replicate) sem reescrever o pipeline.

---

## 📌 Próximos Passos

1. [ ] Criar conta na MuAPI, gerar API key e rodar um lote de teste: 3–5 imagens com GPT Image 2 + 3 vídeos com Seedance 2.0 Mini (image-to-video) — validar custo real por vídeo e consistência visual da modelo
2. [ ] Bootstrap do projeto: Next.js + Supabase (schema: `models`, `products`, `video_jobs`) + auth
3. [ ] Implementar gerador de personas (Claude + JSON schema) e geração das imagens de referência da modelo
4. [ ] Implementar pipeline de vídeo: fila → MuAPI → webhook → storage → painel com download
5. [ ] Painel de monitoramento (fila, falhas, custo diário) + limite de gasto diário
6. [ ] Rodar 1 semana em produção com 10 vídeos/dia antes de escalar para 40

---

*Gerado com Agent Architect — JET Digital*
