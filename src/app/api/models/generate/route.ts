import { NextResponse } from 'next/server';
import { z } from 'zod';
import { RegionSchema } from '@/types';
import { generatePersona } from '@/lib/claude';
import { DEFAULT_IMAGE_ENGINE } from '@/lib/engines';
import { generateImage, muApiConfigFromEnv } from '@/lib/muapi';
import { createServerSupabase } from '@/lib/supabase/server';

// Persona via Claude + submissões de referência à MuAPI numa request só.
export const maxDuration = 60;

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
      engineId: DEFAULT_IMAGE_ENGINE,
      prompt: `${persona.image_prompt} — reference shot ${i + 1}, same person, slightly different pose`,
    });
    await supabase.from('image_jobs').insert({ model_id: model.id, muapi_request_id: requestId });
  }
  return NextResponse.json({ modelId: model.id }, { status: 201 });
}
