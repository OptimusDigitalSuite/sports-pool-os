import type { Metadata, Viewport } from 'next';
import { Barlow, Barlow_Condensed } from 'next/font/google';
import './globals.css';

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-barlow',
  display: 'swap',
});

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-barlow-condensed',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Sports Pool OS',
  description: 'A private NFL pick’em pool.',
  // Player pages are reachable by secret link; none of this should be indexed.
  robots: { index: false, follow: false },
  // iOS ignores the web manifest for "Add to Home Screen" and needs its own
  // apple-* meta tags to install standalone (no browser chrome) at all —
  // app/manifest.ts alone is enough for Android/desktop, not Safari.
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Sports Pool OS',
  },
};

export const viewport: Viewport = {
  // Hardcoded because <meta name="theme-color"> can't read a CSS custom
  // property. Derived from --bg-void (oklch(0.14 0.018 255)) in globals.css —
  // keep the two in sync if that token ever changes.
  themeColor: '#050910',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <body className="min-h-[100dvh]">{children}</body>
    </html>
  );
}
