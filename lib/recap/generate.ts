import { plainSummary, type RecapInput } from '@/lib/recap/summary';

/** The slice of the Anthropic SDK this module uses, so tests need no network or key. */
export interface AnthropicLike {
  beta: {
    messages: {
      create(params: Record<string, unknown>): Promise<{
        content: Array<{ type: string; text?: string }>;
        stop_reason?: string;
        model?: string;
      }>;
    };
  };
}

const SYSTEM = [
  'You write the weekly recap for a private NFL pick’em pool among friends.',
  'Voice: group chat. Short, funny, a little mean, never cruel.',
  'Three or four sentences, no lists, no headings, no emoji spam.',
  'Call out the winner, the worst record, and anyone whose picks were auto-filled because they forgot.',
  'Use only the numbers you are given. Never invent a game, a score, or a name.',
].join(' ');

/**
 * Asks Claude for the week's trash talk, and degrades to the plain summary on
 * any failure — a refusal, a rate limit, a network error, or a response with
 * no usable text. The recap is the one part of the week that is allowed to be
 * missing, so it never throws.
 *
 * `onDegraded`, when given, is told WHY it degraded. A refusal and a rate
 * limit both look identical to the pool (everyone just gets the plain
 * summary) — without this, a real bug (an SDK shape change producing a
 * TypeError) would silently look the same as a rate limit forever, with no
 * signal that anything needs fixing.
 */
export async function generateRecap(
  deps: { client: AnthropicLike; onDegraded?: (reason: string) => void },
  input: RecapInput,
): Promise<string> {
  try {
    const response = await deps.client.beta.messages.create({
      model: 'claude-opus-5',
      max_tokens: 1024,
      // Adaptive thinking with a low effort level: this is a short, easy
      // generation. `budget_tokens` is removed on this model and 400s.
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      // Server-side refusal fallback, per Anthropic's default guidance for
      // this model. A refusal still degrades to plainSummary below.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: JSON.stringify(input) }],
    });

    if (response.stop_reason === 'refusal') {
      deps.onDegraded?.('refusal');
      return plainSummary(input);
    }

    const text = response.content.find((block) => block.type === 'text')?.text?.trim();
    if (text && text.length > 0) return text;
    deps.onDegraded?.('empty response');
    return plainSummary(input);
  } catch (error) {
    deps.onDegraded?.(error instanceof Error ? error.message : String(error));
    return plainSummary(input);
  }
}
