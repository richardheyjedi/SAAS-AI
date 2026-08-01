import { NextResponse } from 'next/server';
import { PersonaSchema } from '@/types';
import { generateImage, muApiConfigFromEnv } from '@/lib/muapi';
import { createServerSupabase } from '@/lib/supabase/server';
import { NewRefsBodySchema } from './schema';

// Submissões sequenciais à MuAPI dentro da request.
export const maxDuration = 60;

/**
 * Gera novas referências para um modelo existente, com ajustes opcionais.
 * Havendo uma foto base, usa image-to-image a partir dela (mesmo rosto);
 * sem nenhuma referência, cai no text-to-image do prompt da persona.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const parsed = NewRefsBodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { adjustPrompt, count } = parsed.data;

  const { data: model } = await supabase
    .from('models')
    .select('id,persona,image_engine,reference_image_urls')
    .eq('id', id)
    .single();
  if (!model) return NextResponse.json({ error: 'Modelo não encontrado' }, { status: 404 });

  const persona = PersonaSchema.parse(model.persona);
  const base: string | undefined = (model.reference_image_urls ?? [])[0];
  const adjustments = adjustPrompt?.trim()
    ? ` Adjustments requested: ${adjustPrompt.trim()}.`
    : '';

  const cfg = muApiConfigFromEnv();
  try {
    for (let i = 0; i < count; i++) {
      const { requestId } = await generateImage(cfg, {
        engineId: model.image_engine,
        prompt: base
          ? `New reference photo of the exact same person as in the reference image — identical face, hair and identity. ${persona.image_prompt}.${adjustments} Slightly different pose, shot ${i + 1}.`
          : `${persona.image_prompt}.${adjustments} Reference shot ${i + 1}, same person, slightly different pose.`,
        ...(base ? { imageUrls: [base] } : {}),
      });
      await supabase.from('image_jobs').insert({ model_id: model.id, muapi_request_id: requestId });
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Falha ao gerar referências na MuAPI: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
  return NextResponse.json({ submitted: count }, { status: 201 });
}
