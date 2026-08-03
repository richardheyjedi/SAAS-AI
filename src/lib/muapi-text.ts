import type { ModelCaller } from './claude';

// Geração de texto via MuAPI (ex.: gpt-5-mini): padrão assíncrono
// submit → request_id → poll em /predictions/{id}/result até completed.
// Validado ao vivo em 2026-08-01: outputs[0] traz o texto gerado.
// 130s por chamada: o retry de JSON inválido faz até 2 chamadas (260s), que
// precisam caber no maxDuration de 300s das rotas que geram texto.
const POLL_TIMEOUT_MS = 130_000;
/** Status transitórios do poll: ainda não pronto / instabilidade — seguir tentando. */
const TRANSIENT_POLL_STATUS = new Set([404, 408, 429]);

function pollIntervalMs(): number {
  const v = Number(process.env.MUAPI_TEXT_POLL_MS ?? 2000);
  return Number.isFinite(v) && v >= 100 ? v : 2000;
}

export const muapiTextCaller: ModelCaller = async (system, user) => {
  const apiKey = process.env.MUAPI_API_KEY;
  if (!apiKey) throw new Error('MUAPI_API_KEY ausente');
  const baseUrl = process.env.MUAPI_BASE_URL ?? 'https://api.muapi.ai';
  const model = process.env.MUAPI_TEXT_MODEL ?? 'gpt-5-mini';

  const res = await fetch(`${baseUrl}/api/v1/${model}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ prompt: user, system_prompt: system }),
  });
  if (!res.ok) throw new Error(`MuAPI texto ${res.status}: ${await res.text()}`);
  const submit = (await res.json()) as { request_id?: string };
  if (!submit.request_id) throw new Error('MuAPI texto: resposta sem request_id');

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollIntervalMs()));
    const poll = await fetch(`${baseUrl}/api/v1/predictions/${submit.request_id}/result`, {
      headers: { 'x-api-key': apiKey },
    });
    // Instabilidade transitória não pode descartar um trabalho já pago:
    // 404 logo após o submit, 429 e 5xx seguem no loop até o deadline.
    if (!poll.ok) {
      if (TRANSIENT_POLL_STATUS.has(poll.status) || poll.status >= 500) continue;
      throw new Error(`MuAPI texto poll ${poll.status}: ${await poll.text()}`);
    }
    const data = (await poll.json()) as { status?: string; outputs?: string[]; error?: string };
    if (data.status === 'completed') {
      const text = data.outputs?.[0];
      if (!text) throw new Error('MuAPI texto: completed sem output');
      return text;
    }
    if (data.status === 'failed') throw new Error(`MuAPI texto falhou: ${data.error || 'sem detalhe'}`);
  }
  throw new Error('MuAPI texto: timeout aguardando resultado');
};
