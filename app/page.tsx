import { VideoBackdrop } from '@/components/VideoBackdrop';
import { Panel } from '@/components/ui/Panel';

export const dynamic = 'force-static';

/**
 * Sports Pool OS has no public front door — no sign-up, no marketing copy, nothing
 * to browse. Every player and commissioner arrives through a private link
 * (app/p/[token], or app/p/[token]/admin for the commissioner) that a
 * commissioner pasted into the group chat. This route exists only to catch
 * whoever lands on the bare domain
 * anyway — the installed PWA's start_url (app/manifest.ts, which is
 * token-free by necessity: see that file's comment), a bookmark, someone
 * typing the domain from memory — and tell them where to actually go,
 * instead of Next's default 404 (review Finding 2).
 */
export default function Home() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-4">
      <VideoBackdrop intensity="wash" />
      <Panel className="max-w-[420px] text-center">
        <h1 className="font-[family-name:var(--font-barlow-condensed)] text-2xl">Sports Pool OS</h1>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          This app opens from a commissioner&apos;s private link — there&apos;s nothing to sign
          up for here. Ask your commissioner to resend your link if you&apos;ve lost it.
        </p>
      </Panel>
    </main>
  );
}
