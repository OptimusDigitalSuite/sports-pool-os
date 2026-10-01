'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { markPlayerPaid, removePlayer, setPlayerEmail } from '@/app/p/[token]/admin/actions';

export interface RosterMember {
  id: string;
  name: string;
  email: string | null;
  invite: string;
  picks: number;
  /** null when they have not entered this week at all. */
  paid: boolean | null;
}

/**
 * Everyone in the pool, not just everyone who has entered this week.
 *
 * The console used to list entries, so a player who had never picked — the
 * exact person who needs chasing — did not appear on it at all. They do now,
 * and the row carries the two things that unstick them: an address, so the
 * agents can reach them, and their link, so the commissioner can hand it over
 * when they cannot.
 */
export function Roster({ token, members }: { token: string; members: RosterMember[] }) {
  return (
    <Panel>
      <h2 className="mb-1 font-[family-name:var(--font-barlow-condensed)] text-xl">Roster</h2>
      <p className="mb-3 text-sm text-[var(--text-tertiary)]">
        A player with no address cannot be reminded — nothing can write to them. Add one and the
        pool starts chasing them for you.
      </p>
      <ul className="space-y-3">
        {members.map((member) => (
          <RosterRow key={member.id} token={token} member={member} />
        ))}
      </ul>
    </Panel>
  );
}

function RosterRow({ token, member }: { token: string; member: RosterMember }) {
  const [email, setEmail] = useState(member.email);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [paid, setPaid] = useState(member.paid);
  const [removing, setRemoving] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [pending, startTransition] = useTransition();

  if (removed) {
    return (
      <li className="border-b border-white/5 pb-3 text-sm text-[var(--text-tertiary)] last:border-0 last:pb-0">
        {member.name} removed. Their link no longer works.
      </li>
    );
  }

  return (
    <li className="border-b border-white/5 pb-3 last:border-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{member.name}</span>
        <span className="text-sm tabular-nums text-[var(--text-tertiary)]">
          {member.picks} {member.picks === 1 ? 'pick' : 'picks'}
          {paid === true ? ' · paid' : paid === null ? ' · not in' : ' · owes'}
        </span>
      </div>

      {email ? (
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{email}</p>
      ) : (
        <form
          className="mt-2 flex gap-2"
          action={(formData) => {
            const value = String(formData.get('email') ?? '');
            setError(null);
            startTransition(async () => {
              const result = await setPlayerEmail(token, member.id, value);
              if (result.ok) setEmail(value.trim().toLowerCase());
              else setError(result.reason);
            });
          }}
        >
          <input
            name="email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Email address"
            required
            className="min-w-0 flex-1 rounded-[var(--radius-md)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
          />
          <Button type="submit" variant="ghost" disabled={pending}>
            {pending ? 'Saving' : 'Save'}
          </Button>
        </form>
      )}

      {error && <p className="mt-1 text-sm text-[var(--accent-warn-500,#f87171)]">{error}</p>}

      {removing && (
        <form
          className="mt-2 rounded-[var(--radius-md)] bg-[var(--bg-surface)] p-3"
          action={(formData) => {
            setError(null);
            startTransition(async () => {
              const result = await removePlayer(token, member.id, String(formData.get('confirm') ?? ''));
              if (result.ok) setRemoved(true);
              else setError(result.reason);
            });
          }}
        >
          <p className="mb-2 text-sm">
            Remove {member.name} from the pool? Their link stops working and their unpaid entry comes
            out of the pot. Type <strong>REMOVE</strong> to confirm.
          </p>
          <div className="flex gap-2">
            <input
              name="confirm"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="REMOVE"
              required
              className="min-w-0 flex-1 rounded-[var(--radius-md)] bg-[var(--bg-elevated,rgba(255,255,255,0.06))] px-3 py-2 text-sm"
            />
            <Button type="submit" variant="ghost" disabled={pending}>
              {pending ? 'Removing' : 'Confirm'}
            </Button>
          </div>
        </form>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        {paid !== true && (
          <form
            action={() => {
              setError(null);
              startTransition(async () => {
                const result = await markPlayerPaid(token, member.id);
                // Marking someone paid enters them in the week if they had
                // not picked yet, which is what makes auto-pick fill for them
                // at lock instead of leaving a paid player with nothing.
                if (result.ok) setPaid(true);
                else setError(result.reason);
              });
            }}
          >
            <Button type="submit" variant="money" disabled={pending}>
              Mark paid
            </Button>
          </form>
        )}
        <Button type="button" variant="ghost" onClick={() => setRemoving((v) => !v)}>
          {removing ? 'Cancel' : 'Remove'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(member.invite);
            } catch {
              // Clipboard access is refused outside a secure context and in
              // some in-app browsers. Showing the text still gets the link
              // out; failing silently would not.
              window.prompt('Copy this invite', member.invite);
            }
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? 'Copied' : 'Copy invite'}
        </Button>
      </div>
    </li>
  );
}
