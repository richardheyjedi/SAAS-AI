import { createServerSupabase } from '@/lib/supabase/server';
import { ProductForm } from './ProductForm';

type ProductRow = {
  id: string;
  title: string;
  description: string;
  price_brl: number | null;
  image_urls: string[] | null;
  created_at: string;
};

export default async function ProductsPage() {
  let products: ProductRow[] = [];
  try {
    const supabase = await createServerSupabase();
    const { data } = await supabase.from('products').select('*').order('created_at', { ascending: false });
    products = data ?? [];
  } catch {
    products = [];
  }

  return (
    <section className="screen on">
      <div className="head">
        <div>
          <h1>Produtos</h1>
          <div className="sub">Itens do seu TikTok Shop com fotos para composição modelo + produto</div>
        </div>
      </div>
      <div className="grid3">
        {products.map((p) => {
          const thumb = p.image_urls?.[0];
          const photoCount = p.image_urls?.length ?? 0;
          const price = p.price_brl != null ? p.price_brl.toFixed(2).replace('.', ',') : '—';
          return (
            <div className="card" key={p.id}>
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumb}
                  alt={p.title}
                  className="prod"
                  style={{ width: '100%', objectFit: 'cover', fontSize: 0 }}
                />
              ) : (
                <div className="prod">📦</div>
              )}
              <div className="card-body">
                <b>{p.title}</b>
                <div className="d">
                  R$ {price} · {photoCount} {photoCount === 1 ? 'foto' : 'fotos'}
                </div>
              </div>
            </div>
          );
        })}
        <ProductForm />
      </div>
    </section>
  );
}
