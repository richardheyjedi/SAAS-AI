import Anthropic from '@anthropic-ai/sdk';
import { PersonaSchema, ScriptListSchema, type Gender, type Persona, type Region, type Script } from '@/types';
import { personaSystemPrompt, personaUserPrompt } from '@/prompts/persona';
import { scriptsSystemPrompt, scriptsUserPrompt } from '@/prompts/video-scripts';
import { muapiTextCaller } from './muapi-text';

export type ModelCaller = (system: string, user: string) => Promise<string>;

/** Provedor de texto escolhido por env: TEXT_PROVIDER=muapi usa o gpt-5 da MuAPI; default Anthropic. */
export function defaultTextCaller(): ModelCaller {
  return process.env.TEXT_PROVIDER === 'muapi' ? muapiTextCaller : anthropicCaller;
}

export const anthropicCaller: ModelCaller = async (system, user) => {
  const client = new Anthropic();
  // Streaming obrigatório: com max_tokens alto o SDK recusa chamadas
  // não-streaming ("Streaming is strongly recommended..."). O finalMessage()
  // acumula o stream e devolve o mesmo shape do create().
  const msg = await client.messages
    .stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 32000,
      system,
      messages: [{ role: 'user', content: user }],
    })
    .finalMessage();
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
  input: { region: Region; gender?: Gender; customPrompt?: string; productContext?: string },
  call: ModelCaller = defaultTextCaller(),
): Promise<Persona> {
  return callValidated(call, personaSystemPrompt, personaUserPrompt(input), (d) => PersonaSchema.parse(d));
}

export async function generateScripts(
  input: { persona: Persona; productTitle: string; productDescription: string; count: number; durationSeconds: number },
  call: ModelCaller = defaultTextCaller(),
): Promise<Script[]> {
  const r = await callValidated(call, scriptsSystemPrompt, scriptsUserPrompt(input), (d) => ScriptListSchema.parse(d));
  return r.scripts;
}
