import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('../../app/globals.css', import.meta.url)), 'utf8');

const REQUIRED = [
  '--bg-void', '--bg-surface', '--bg-elevated', '--bg-scrim',
  '--text-primary', '--text-secondary', '--text-tertiary', '--text-disabled',
  '--border-hairline', '--border-hairline-strong', '--glass-inner-highlight',
  '--accent-hot-500', '--accent-hot-600', '--accent-hot-700', '--accent-hot-dim', '--on-accent-hot',
  '--money-amber-500', '--money-amber-600', '--money-amber-700', '--money-amber-dim', '--on-money',
  '--state-locked', '--state-locked-fg',
  '--duration-instant', '--duration-fast', '--duration-base', '--duration-slow', '--duration-cinematic',
  '--ease-spring', '--ease-out-standard', '--ease-in-standard',
  '--radius-sm', '--radius-md', '--radius-lg', '--radius-xl',
];

describe('design tokens', () => {
  it.each(REQUIRED)('defines %s', (token) => {
    expect(css).toContain(`${token}:`);
  });

  it('uses OKLCH for every colour token, never hex', () => {
    const colourLines = css
      .split('\n')
      .filter((line) => /--(bg|text|border|accent|money|on)-/.test(line) && line.includes(':'));
    expect(colourLines.length).toBeGreaterThan(10);
    for (const line of colourLines) {
      expect(line).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });

  it('never uses pure black', () => {
    expect(css).not.toMatch(/oklch\(\s*0\s+0\s+0\s*\)/);
    expect(css).not.toMatch(/#000\b|#000000\b/);
  });

  it('suppresses motion and video under prefers-reduced-motion', () => {
    expect(css).toContain('prefers-reduced-motion: reduce');
  });

  it('sets tabular numerals as a utility the number components can use', () => {
    expect(css).toContain('font-variant-numeric: tabular-nums');
  });
});
