import { z } from 'zod';

export const APP_NAME = 'AutoReelsAI';

export const RegionSchema = z.enum(['br', 'us', 'us_latina', 'custom']);
export type Region = z.infer<typeof RegionSchema>;

export const GenderSchema = z.enum(['female', 'male']);
export type Gender = z.infer<typeof GenderSchema>;

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
