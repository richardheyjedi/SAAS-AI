import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase/server';
import { PersonaSchema } from '@/types';
import { BatchForm, type BatchModel, type BatchProduct } from './BatchForm';

const REGION_LABEL: Record<string, string> = {
  br: '🇧🇷 Brasileira',
  us: '🇺🇸 Americana',
  us_latina: '🇺🇸 US · Latina',
  custom: 'Personalizada',
};

export default async function NewBatchPage() {
  let models: BatchModel[] = [];
  let products: BatchProduct[] = [];

  try {
    const supabase = await createServerSupabase();
    const [modelsRes, productsRes] = await Promise.all([
      supabase.from('models').select('*').eq('status', 'approved').order('created_at', { ascending: false }),
      supabase.from('products').select('*').order('created_at', { ascending: false }),
    ]);

    models = (modelsRes.data ?? []).map((m: any) => {
      const persona = PersonaSchema.safeParse(m.persona);
      return {
        id: m.id,
        name: m.name,
        region: m.region,
        regionLabel: REGION_LABEL[m.region] ?? m.region,
        niche: persona.success ? persona.data.niche : '',
        thumb: m.reference_image_urls?.[0] ?? null,
        productId: m.product_id ?? null,
      };
    });
    products = (productsRes.data ?? []).map((p: any) => ({
      id: p.id,
      title: p.title,
      priceBrl: p.price_brl,
      thumb: p.image_urls?.[0] ?? null,
    }));
  } catch {
    models = [];
    products = [];
  }

  return (
    <section className="screen on">
      <div className="head">
        <div>
          <h1>Novo lote</h1>
          <div className="sub">Escolha a modelo, o produto e quantos vídeos quer gerar — o custo aparece antes de confirmar</div>
        </div>
      </div>
      {models.length === 0 ? (
        <div className="card" style={{ padding: 18 }}>
          Nenhuma modelo aprovada ainda. <Link href="/models">Crie e aprove uma modelo</Link> antes de montar um lote.
        </div>
      ) : (
        <BatchForm models={models} products={products} />
      )}
    </section>
  );
}
