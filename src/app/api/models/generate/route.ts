import { NextResponse } from 'next/server';
import { generatePersona } from '@/lib/claude';
import { generateImage, muApiConfigFromEnv } from '@/lib/muapi';
import { createServerSupabase } from '@/lib/supabase/server';
import { ModelGenerateBodySchema } from './schema';

// Persona via Claude + submissões de referência à MuAPI numa request só.
export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const parsed = ModelGenerateBodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { region, customPrompt, refCount, imageEngine } = parsed.data;

  const persona = await generatePersona({ region, customPrompt });
  const { data: model, error } = await supabase
    .from('models')
    .insert({ name: persona.name, region, persona, status: 'generating_refs', image_engine: imageEngine })
    .select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const cfg = muApiConfigFromEnv();
  for (let i = 0; i < refCount; i++) {
    const { requestId } = await generateImage(cfg, {
      engineId: imageEngine,
      prompt: `${persona.image_prompt} — reference shot ${i + 1}, same person, slightly different pose`,
    });
    await supabase.from('image_jobs').insert({ model_id: model.id, muapi_request_id: requestId });
  }
  return NextResponse.json({ modelId: model.id }, { status: 201 });
}
