import { Sidebar } from '@/app/components/Sidebar';

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <Sidebar />
      <main>{children}</main>
    </div>
  );
}
