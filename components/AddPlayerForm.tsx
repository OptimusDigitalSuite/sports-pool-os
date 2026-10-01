'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { addPlayer } from '@/app/p/[token]/admin/actions';

/**
 * Type a name, get a paste-ready invite. The invite is shown, not emailed —
 * the commissioner drops it into the group chat themselves.
 */
export function AddPlayerForm({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [invite, setInvite] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <Panel>
      <h2 className="mb-3 font-[family-name:var(--font-barlow-condensed)] text-xl">Add a player</h2>
      <form
        action={(formData) => {
          setError(null);
          startTransition(async () => {
            const result = await addPlayer(
              token,
              String(formData.get('name') ?? ''),
              (formData.get('email') as string) || null,
            );
            if (result.ok) setInvite(result.invite);
            else setError(result.reason);
          });
        }}
        className="space-y-3"
      >
        <input
          name="name"
          placeholder="Name"
          required
          className="w-full rounded-[var(--radius-md)] bg-[var(--bg-surface)] px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
        />
        <input
          name="email"
          type="email"
          placeholder="Email (optional)"
          className="w-full rounded-[var(--radius-md)] bg-[var(--bg-surface)] px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
        />
        <Button type="submit" variant="primary" disabled={pending}>
          Add player
        </Button>
      </form>

      {error && (
        <p role="alert" className="mt-3 text-sm text-[var(--text-secondary)]">
          {error}
        </p>
      )}

      {invite && (
        <div className="mt-4">
          <p className="mb-2 text-sm text-[var(--text-tertiary)]">Paste this into the group chat:</p>
          <textarea
            readOnly
            value={invite}
            rows={5}
            className="w-full rounded-[var(--radius-md)] bg-[var(--bg-surface)] p-3 text-sm text-[var(--text-primary)]"
          />
        </div>
      )}
    </Panel>
  );
}
