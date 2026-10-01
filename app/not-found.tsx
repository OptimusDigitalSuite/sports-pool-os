import { VideoBackdrop } from '@/components/VideoBackdrop';
import { Panel } from '@/components/ui/Panel';

/**
 * Every route in this app is reached by a private token (a player link) or
 * is otherwise gated on data that has to exist — there is no page a person
 * navigates to by browsing. So whatever lands someone here — an invalid
 * token, a deactivated player, a typo'd link — the fix is always the same:
 * get a fresh link from the commissioner. Next's default 404 says none of
 * that and offers no way forward (review Minor 11); this replaces it with a
 * plain, human message instead of jargon or a stack trace.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-4">
      <VideoBackdrop intensity="wash" />
      <Panel className="max-w-[420px] text-center">
        <h1 className="font-[family-name:var(--font-barlow-condensed)] text-2xl">
          That link isn&apos;t working
        </h1>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          It may be old or no longer active. Ask your commissioner to send you a fresh one.
        </p>
      </Panel>
    </main>
  );
}
