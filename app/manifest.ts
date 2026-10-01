import type { MetadataRoute } from 'next';

// The manifest's background_color/theme_color are, along with
// app/layout.tsx's Viewport.themeColor, the only two hardcoded colours
// permitted in this codebase (DESIGN.md §8) — neither the Web App Manifest
// spec nor <meta name="theme-color"> can read a CSS custom property. The
// value below is --bg-void (oklch(0.14 0.018 255)) resolved to sRGB hex; if
// that token ever changes, update it here and in app/layout.tsx together.
const BG_VOID_HEX = '#050910';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Sports Pool OS',
    // Home-screen label: iOS truncates past ~12 chars, so this is the short form.
    short_name: 'Pool',
    description: 'A private NFL pick’em pool.',
    start_url: '/',
    display: 'standalone',
    background_color: BG_VOID_HEX,
    theme_color: BG_VOID_HEX,
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
