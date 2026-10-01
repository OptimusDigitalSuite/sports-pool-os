import Link from 'next/link';
import { createRepositories } from '@/lib/db/repositories';
import { createServiceClient } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

/**
 * The player shell — wraps /p/[token] (Picks), /everyone and /standings
 * with a persistent bottom tab bar (DESIGN.md's phone-first player surface).
 * Uses next/link rather than a full <a> reload so Next.js App Router's own
 * client-side navigation applies; app/globals.css's `@view-transition` rule
 * covers the cross-document case this doesn't reach (see that rule's
 * comment). `.glass` is safe on this bar specifically because it's `fixed`
 * — DESIGN.md §8 bans backdrop-blur on anything that scrolls with the page.
 *
 * Also decides whether to show the Admin tab. Simplest option: resolve the
 * player from the token right here, the same one-line lookup the admin page
 * itself does — rather than threading an isCommissioner flag down from
 * every route that renders under this layout. This is display-only (hiding
 * a link is not a security boundary); app/p/[token]/admin/page.tsx and its
 * server actions are what actually gate the console.
 */
export default async function PlayerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const repos = createRepositories(createServiceClient());
  const viewer = await repos.players.getByToken(token);
  const isCommissioner = viewer !== null && viewer.is_active && viewer.is_commissioner;

  return (
    <>
      {children}
      <nav
        className="glass fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-[480px] justify-around p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        aria-label="Player navigation"
      >
        {/* px-4, not px-6: a fourth tab (five for the commissioner) does not
            fit the 480px bar at the wider padding without labels wrapping
            on a small phone. */}
        <Link
          href={`/p/${token}`}
          className="flex min-h-[44px] items-center rounded-[var(--radius-sm)] px-4 py-2 text-[var(--text-primary)]"
        >
          Picks
        </Link>
        <Link
          href={`/p/${token}/everyone`}
          className="flex min-h-[44px] items-center rounded-[var(--radius-sm)] px-4 py-2 text-[var(--text-primary)]"
        >
          Everyone
        </Link>
        <Link
          href={`/p/${token}/standings`}
          className="flex min-h-[44px] items-center rounded-[var(--radius-sm)] px-4 py-2 text-[var(--text-primary)]"
        >
          Standings
        </Link>
        {isCommissioner && (
          <Link
            href={`/p/${token}/admin`}
            className="flex min-h-[44px] items-center rounded-[var(--radius-sm)] px-4 py-2 text-[var(--text-primary)]"
          >
            Admin
          </Link>
        )}
      </nav>
    </>
  );
}
