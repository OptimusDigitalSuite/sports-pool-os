import { describe, it, expect } from 'vitest';
import { buildCommissionerInvite, buildInvite, generateMagicToken } from '@/lib/ui/invite';

describe('generateMagicToken', () => {
  it('produces a long, url-safe, unguessable token', () => {
    const token = generateMagicToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{32,}$/);
  });

  it('never repeats', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateMagicToken()));
    expect(tokens.size).toBe(200);
  });
});

describe('buildInvite', () => {
  it('writes a paste-ready message containing the private link', () => {
    const message = buildInvite({
      baseUrl: 'https://sports-pool-os.example',
      token: 'abc123',
      playerName: 'Kenneth',
      poolName: 'Sunday Money',
      buyInCents: 1000,
    });
    expect(message).toContain('https://sports-pool-os.example/p/abc123');
    expect(message).toContain('Kenneth');
    expect(message).toContain('$10.00');
  });

  it('does not label the link as secret in a way that invites sharing', () => {
    const message = buildInvite({
      baseUrl: 'https://sports-pool-os.example',
      token: 'abc123',
      playerName: 'Kenneth',
      poolName: 'Sunday Money',
      buyInCents: 1000,
    });
    expect(message.toLowerCase()).toContain('just for you');
  });
});

describe('buildCommissionerInvite', () => {
  it('includes everything the normal player invite has', () => {
    const message = buildCommissionerInvite({
      baseUrl: 'https://sports-pool-os.example',
      token: 'abc123',
      playerName: 'Bill',
      poolName: 'Sunday Money',
      buyInCents: 1000,
    });
    expect(message).toContain('https://sports-pool-os.example/p/abc123');
    expect(message).toContain('Bill');
    expect(message).toContain('$10.00');
  });

  it('appends the commissioner console link', () => {
    const message = buildCommissionerInvite({
      baseUrl: 'https://sports-pool-os.example',
      token: 'abc123',
      playerName: 'Bill',
      poolName: 'Sunday Money',
      buyInCents: 1000,
    });
    expect(message).toContain('https://sports-pool-os.example/p/abc123/admin');
  });

  it('does not change the normal player invite', () => {
    const message = buildInvite({
      baseUrl: 'https://sports-pool-os.example',
      token: 'abc123',
      playerName: 'Kenneth',
      poolName: 'Sunday Money',
      buyInCents: 1000,
    });
    expect(message).not.toContain('/admin');
  });
});
