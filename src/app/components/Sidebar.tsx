'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  {
    href: '/',
    label: 'Dashboard',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
        <rect x="1" y="1" width="5.5" height="5.5" rx="1.5" />
        <rect x="8.5" y="1" width="5.5" height="5.5" rx="1.5" />
        <rect x="1" y="8.5" width="5.5" height="5.5" rx="1.5" />
        <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1.5" />
      </svg>
    ),
  },
  {
    href: '/models',
    label: 'Modelos',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
        <circle cx="7.5" cy="4.5" r="3" />
        <path d="M1.5 13.5a6 6 0 0 1 12 0z" />
      </svg>
    ),
  },
  {
    href: '/products',
    label: 'Produtos',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
        <path d="M2 4.5 7.5 1.5 13 4.5v6L7.5 13.5 2 10.5z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    href: '/batches/new',
    label: 'Novo lote',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
        <rect x="1.5" y="2.5" width="12" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M6.2 5.4v4.2l3.6-2.1z" />
      </svg>
    ),
  },
  {
    href: '/videos',
    label: 'Vídeos',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
        <rect x="1.5" y="1.5" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M7.5 4.2v6.6M4.2 7.5h6.6"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
          transform="rotate(45 7.5 7.5)"
        />
      </svg>
    ),
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside>
      <div className="logo">
        <div className="logo-mark"></div>
        <b>
          UGC<span>X</span>
        </b>
      </div>
      <div className="nav-label">Estúdio</div>
      <nav>
        {ITEMS.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={active ? 'on' : ''}>
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
