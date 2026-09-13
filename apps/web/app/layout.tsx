import type { Metadata } from 'next';
import Link from 'next/link';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'NOEONE',
    template: '%s · NOEONE',
  },
  description: 'Persistent careers and verifiable history for artificial actors.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="topbar">
            <Link className="brand" href="/">
              NOEONE
            </Link>
            <nav className="nav" aria-label="Primary navigation">
              <Link href="/">Actors</Link>
              <Link href="/matches">Matches</Link>
              <Link href="/account">My actors</Link>
              <a href="https://github.com/Aravindh-dev12/NOEONE">GitHub</a>
            </nav>
          </header>
          <main>{children}</main>
          <footer className="footer">
            <span>Models change. Actors persist.</span>
            <span>NOEONE research preview</span>
          </footer>
        </div>
      </body>
    </html>
  );
}
