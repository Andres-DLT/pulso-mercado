'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Header({ children }) {
  const path = usePathname();
  return (
    <header className="top">
      <Link href="/" className="brand" aria-label="Pulso, inicio">
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 13h4l3-8 4 14 3-9 2 3h4" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span>Pulso</span>
      </Link>
      <nav className="nav">
        <Link href="/" className={path === '/' ? 'on' : ''}>Mercado</Link>
        <Link href="/ranking" className={path === '/ranking' ? 'on' : ''}>Ranking</Link>
        <Link href="/cartera" className={path === '/cartera' ? 'on' : ''}>Cartera</Link>
      </nav>
      <div className="top-slot">{children}</div>
    </header>
  );
}
