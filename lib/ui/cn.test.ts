import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/ui/cn';

describe('cn', () => {
  it('joins class names, dropping falsy values', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
  });

  it('resolves a later conflicting Tailwind utility over an earlier one, regardless of source order', () => {
    // A naive `join` would emit "p-5 p-0" and let the built stylesheet's own
    // source order decide the winner — which is exactly the bug this
    // guards: `.p-5` sorted after `.p-0` in the compiled CSS and silently
    // won, even though `p-0` was passed later as the override.
    const result = cn('p-5', 'p-0');
    expect(result).toContain('p-0');
    expect(result).not.toContain('p-5');
  });
});
