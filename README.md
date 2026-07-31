# AutoReelsAI

## Visão geral

O AutoReelsAI cria modelos virtuais (influenciadoras) por região ou prompt livre, associa produtos (a partir de fotos públicas) e gera lotes de vídeos de divulgação sob demanda, usando a MuAPI para imagem/vídeo e Claude para os roteiros de cada cena. O motor de imagem é selecionável entre **GPT Image 2** e **Nano Banana 2**, e o de vídeo entre os 9 tiers image-to-video do **Seedance 2.0** (do Mini ao VIP 4K) — o custo estimado de cada geração é calculado por uma tabela local de preços e exibido antes de confirmar. Os vídeos prontos ficam disponíveis para download manual na tela **Vídeos**, para você postar no TikTok Shop.

## Pré-requisitos

- Node.js 20+
- Conta [Supabase](https://supabase.com) (plano free é suficiente)
- Conta [MuAPI](https://muapi.ai) com API key
- API key da [Anthropic](https://console.anthropic.com) (Claude)
- Conta [Vercel](https://vercel.com) para o deploy

## Setup local passo a passo

1. **Crie o projeto no Supabase** e, no **SQL Editor**, cole e execute o conteúdo de `supabase/migrations/0001_init.sql`. Se o projeto já existir de uma versão anterior, também rode `supabase/migrations/0002_engines.sql` no **SQL Editor** — ela adiciona as colunas de motor selecionável usadas por modelos/lotes.
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
   | `ALLOWED_EMAILS` | E-mails autorizados a usar o painel, separados por vírgula (ex.: `voce@exemplo.com,socio@exemplo.com`). Vazio = qualquer conta autenticada pode entrar |
   | `DAILY_VIDEO_LIMIT` | Guardrail: máximo de vídeos gerados por dia (ex.: `40`) |

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
- **Confira os slugs de modelo da MuAPI** antes do primeiro uso: os motores e seus paths de endpoint (`t2iPath`/`i2iPath` para imagem, o slug de cada tier de vídeo) estão centralizados em `src/lib/engines.ts` e foram definidos com base na documentação disponível no momento da implementação — podem ter mudado. Compare com https://muapi.ai/docs e ajuste se necessário — o mesmo vale para o formato do payload (`image_url`, `duration`, `resolution` etc.) e do retorno do webhook (`request_id`, `status`, `outputs`).

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

O motor de imagem e o de vídeo são escolhidos por modelo/lote, e o custo estimado (via tabela local de preços, `src/lib/engines.ts`) é mostrado antes de confirmar a criação. Valores abaixo são estimativas de catálogo, não uma cobrança garantida:

| Item | Motor | Custo aproximado |
|---|---|---|
| Imagem | GPT Image 2 | US$ 0,09 por imagem |
| Imagem | Nano Banana 2 | US$ 0,06 por imagem |
| Vídeo (5s) | Seedance 2.0 Mini | US$ 0,20 |
| Vídeo (5s) | Seedance 2.0 Standard 480p | US$ 0,60 |
| Vídeo (5s) | Seedance 2.0 Standard / Fast | US$ 0,75 |
| Vídeo (5s) | Seedance 2.0 VIP Fast | US$ 1,05 |
| Vídeo (5s) | Seedance 2.0 Full | US$ 1,25 |
| Vídeo (5s) | Seedance 2.0 VIP | US$ 1,50 |
| Vídeo (5s) | Seedance 2.0 VIP 1080p | US$ 3,375 |
| Vídeo (5s) | Seedance 2.0 VIP 4K | US$ 6,75 |

O guardrail `DAILY_VIDEO_LIMIT` limita a quantidade de vídeos processados por dia pelo cron, evitando estouro de orçamento (não há mais um teto de gasto diário em USD).

## Comandos

```
npm run dev     # ambiente de desenvolvimento
npm test        # roda a suíte de testes (vitest)
npm run build   # build de produção
```
