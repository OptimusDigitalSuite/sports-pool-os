import { describe, it, expect } from 'vitest';
import manifest from '@/app/manifest';

describe('manifest', () => {
  it('is installable standalone with the void background', () => {
    const value = manifest();
    expect(value.display).toBe('standalone');
    // Derived from --bg-void (oklch(0.14 0.018 255)) — see app/layout.tsx's
    // themeColor, which must stay in lockstep with this value. Neither
    // <meta name="theme-color"> nor the manifest can read a CSS custom
    // property, so both hardcode the token's resolved sRGB hex instead.
    expect(value.background_color).toBe('#050910');
    expect(value.theme_color).toBe('#050910');
    expect(value.name).toContain('Sports Pool OS');
  });

  it('ships at least one maskable icon', () => {
    const icons = manifest().icons ?? [];
    expect(icons.some((icon) => icon.purpose?.includes('maskable'))).toBe(true);
  });

  it('ships a non-maskable icon too, for surfaces that do their own masking', () => {
    const icons = manifest().icons ?? [];
    expect(icons.some((icon) => icon.purpose === 'any')).toBe(true);
  });

  it('start_url names a route that actually exists, so the installed PWA never opens a 404', async () => {
    const value = manifest();
    expect(value.start_url).toBe('/');
    // Next.js serves '/' from app/page.tsx. Assert the file exports a
    // component — this is exactly the check that was missing when
    // start_url pointed at a route with no page.tsx at all (review Finding 2).
    const page = await import('@/app/page');
    expect(page.default).toBeTypeOf('function');
  });
});
