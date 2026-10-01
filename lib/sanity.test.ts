import { describe, it, expect } from 'vitest';
import { engineName } from '@/lib/sanity';

describe('sanity', () => {
  it('resolves the @ alias and runs TypeScript', () => {
    expect(engineName()).toBe('sports-pool-os-engine');
  });
});
