# AutoReelsAI

## Visão geral

O AutoReelsAI cria modelos virtuais (influenciadoras) por região ou prompt livre, associa produtos (a partir de fotos públicas) e gera lotes de vídeos de divulgação sob demanda, combinando GPT Image 2 e Seedance 2.0 Mini (via MuAPI) para imagem/vídeo e Claude para os roteiros de cada cena. Os vídeos prontos ficam disponíveis para download manual na tela **Vídeos**, para você postar no TikTok Shop.

## Pré-requisitos

- Node.js 20+
- Conta [Supabase](https://supabase.com) (plano free é suficiente)
- Conta [MuAPI](https://muapi.ai) com API key
- API key da [Anthropic](https://console.anthropic.com) (Claude)
- Conta [Vercel](https://vercel.com) para o deploy

## Setup local passo a passo

1. **Crie o projeto no Supabase** e, no **SQL Editor**, cole e execute o conteúdo de `supabase/migrations/0001_init.sql`.
2. Em **Authentication → Users**, crie manualmente o seu usuário (e-mail + senha) — não há tela de cadastro pública no painel.
3. Copie o arquivo de exemplo e preencha cada variável:

   ```
   copy .env.example .env.local
   ```

   | Variável | Onde obter |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Painel do Supabase → Project Settings → API → `Project URL` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Painel do Supabase → Project Settings → API → `anon public` key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Painel do Supabase → Project Settings → API → `service_role` key (secreta, nunca exponha no client) |
   | `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys |
   | `MUAPI_API_KEY` | Painel da MuAPI → API Keys |
   | `MUAPI_BASE_URL` | Normalmente `https://api.muapi.ai` (padrão já assumido se omitida) |
   | `APP_BASE_URL` | Em local, `http://localhost:3000`; em produção, a URL pública do deploy na Vercel |
   | `MUAPI_WEBHOOK_SECRET` | Defina você mesmo um valor aleatório — protege a rota de webhook |
   | `CRON_SECRET` | Defina você mesmo um valor aleatório — a Vercel usa para autenticar o cron |
   | `DAILY_VIDEO_LIMIT` | Guardrail: máximo de vídeos gerados por dia (ex.: `40`) |
   | `DAILY_COST_LIMIT_USD` | Guardrail: teto de gasto diário em USD (ex.: `20`) |

4. Instale e rode:

   ```
   npm install
   npm run dev
   ```

5. Acesse `http://localhost:3000/login` e entre com o usuário criado no passo 2.

## Deploy na Vercel

1. Importe o repositório na Vercel.
2. Configure as mesmas variáveis de ambiente da tabela acima, com `APP_BASE_URL` já apontando para a URL pública do projeto na Vercel (ex.: `https://seu-projeto.vercel.app`).
3. O cron já vem configurado via `vercel.json` (roda `GET /api/cron/process-queue` a cada 5 minutos). A Vercel injeta automaticamente o header `Authorization: Bearer $CRON_SECRET` nas chamadas de cron sempre que a env `CRON_SECRET` existir no projeto — não é preciso nenhuma configuração adicional.

## ⚠️ Antes do primeiro uso real

- **Webhook da MuAPI — `MUAPI_WEBHOOK_SECRET` é obrigatória**: o client (`src/lib/muapi.ts`, função `muApiConfigFromEnv()`) monta a `webhook_url` enviada em cada submissão como `${APP_BASE_URL}/api/webhooks/muapi?secret=${MUAPI_WEBHOOK_SECRET}` (o `?secret=...` só é incluído quando a env está definida). A rota `POST /api/webhooks/muapi` compara esse `?secret=` com a env e **rejeita com 401 sempre que os dois não baterem — inclusive quando a env não existe** (comportamento fail-closed: sem env, nenhum `?secret=` é anexado, e a comparação falha em toda entrega). Na prática, sem `MUAPI_WEBHOOK_SECRET` o pipeline não avança: todo callback da MuAPI é descartado com 401 e os vídeos ficam travados em "Compondo" até o cron marcá-los como falha por timeout. **Defina `MUAPI_WEBHOOK_SECRET` (mesmo valor em local e em produção) antes de gerar qualquer imagem/vídeo real.**
- **`APP_BASE_URL` precisa ser pública** em produção (a MuAPI precisa conseguir alcançar essa URL pela internet) — `http://localhost:3000` só funciona em desenvolvimento com um túnel (ex.: ngrok) apontado para a mesma porta, caso queira testar webhooks reais localmente.
- **Confira os slugs de modelo da MuAPI** antes do primeiro uso: as constantes `IMAGE_MODEL_PATH` e `VIDEO_MODEL_PATH` em `src/lib/muapi.ts` foram definidas com base na documentação disponível no momento da implementação e podem ter mudado. Compare com https://muapi.ai/docs e ajuste se necessário — o mesmo vale para o formato do payload (`image_url`, `duration`, `resolution` etc.) e do retorno do webhook (`request_id`, `status`, `outputs`).

## Fluxo de uso

1. **Criar modelo**: escolha uma região (gera persona automaticamente) ou escreva um prompt livre.
2. Aguarde a geração das fotos de referência (feita pelo cron a cada 5 min).
3. **Aprovar o modelo** depois de revisar as referências geradas.
4. **Cadastrar produto**: informe URLs de fotos públicas do produto.
5. **Novo lote**: escolha modelo + produto + quantidade de vídeos (Z); o custo estimado é exibido antes de confirmar.
6. **Revisar os roteiros** gerados por Claude para cada vídeo do lote e aprovar.
7. O cron processa a fila automaticamente (compõe a imagem do produto com a modelo, depois gera o vídeo).
8. Baixe os vídeos prontos na tela **Vídeos** e poste manualmente no TikTok Shop.

## Custos

| Item | Custo aproximado |
|---|---|
| Imagem (GPT Image 2) | US$ 0,03 – 0,06 por imagem |
| Vídeo (Seedance 2.0 Mini) | US$ 0,08 por segundo (um vídeo de 5s ≈ US$ 0,40) |

Os guardrails `DAILY_VIDEO_LIMIT` e `DAILY_COST_LIMIT_USD` limitam, respectivamente, a quantidade de vídeos e o gasto em USD processados por dia pelo cron, evitando estouro de orçamento.

## Comandos

```
npm run dev     # ambiente de desenvolvimento
npm test        # roda a suíte de testes (vitest)
npm run build   # build de produção
```
