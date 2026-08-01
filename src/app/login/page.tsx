import { signIn } from './actions';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <form action={signIn} className="card" style={{ padding: 28, width: 340, display: 'grid', gap: 12 }}>
        <b style={{ fontSize: 18 }}>UGC<span style={{ color: 'var(--accent)' }}>X</span></b>
        {erro && <div className="alert">E-mail ou senha inválidos</div>}
        <input name="email" type="email" required placeholder="E-mail" className="field" />
        <input name="password" type="password" required placeholder="Senha" className="field" />
        <button type="submit" className="btn primary">Entrar</button>
      </form>
    </main>
  );
}
