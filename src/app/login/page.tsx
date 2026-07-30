import { signIn } from './actions';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <form action={signIn} className="card" style={{ padding: 28, width: 340, display: 'grid', gap: 12 }}>
        <b style={{ fontSize: 18 }}>AutoReelsAI</b>
        {erro && <div className="pill p-err">E-mail ou senha inválidos</div>}
        <input name="email" type="email" required placeholder="E-mail" className="btn" style={{ fontWeight: 400 }} />
        <input name="password" type="password" required placeholder="Senha" className="btn" style={{ fontWeight: 400 }} />
        <button type="submit" className="btn primary">Entrar</button>
      </form>
    </main>
  );
}
