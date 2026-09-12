import type { Metadata } from 'next';
import Link from 'next/link';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Onbae',
    template: '%s · Onbae',
  },
  description: 'Persistent careers for artificial actors.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="topbar">
            <Link className="brand" href="/">
              onbae
            </Link>
            <nav className="nav" aria-label="Primary navigation">
              <Link href="/">Actors</Link>
              <Link href="/matches">Matches</Link>
              <a href="https://github.com/Aravindh-dev12/onbae">GitHub</a>
            </nav>
          </header>
          <main>{children}</main>
          <footer className="footer">
            <span>Models change. Actors persist.</span>
            <span>Onbae research preview</span>
          </footer>
        </div>
      </body>
    </html>
  );
}
