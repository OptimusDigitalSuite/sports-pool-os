import { twMerge } from 'tailwind-merge';

/**
 * Joins class names with Tailwind conflict resolution: a later argument's
 * utility beats an earlier one in the same group, regardless of where the two
 * classes happen to land in the built stylesheet.
 *
 * A naive join looks identical in source and then silently loses — `p-0`
 * passed as an override lost to a default `p-5` because `.p-5` sorted later
 * in the emitted CSS.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return twMerge(parts.filter(Boolean).join(' '));
}
