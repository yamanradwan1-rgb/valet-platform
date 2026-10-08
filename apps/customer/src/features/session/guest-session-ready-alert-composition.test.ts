import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('Guest READY alert composition', () => {
  it('applies canonical and mutation snapshots through one coordinator-owned alert boundary', () => {
    const provider = source('./guest-session-provider.tsx');
    const coordinator = source('./guest-request-coordinator.ts');
    expect(provider).toContain('observeGuestReadySnapshot(tracked, snapshot)');
    expect(coordinator).toContain('this.acceptSession(session)');
    expect(coordinator).toContain('this.acceptSession(retained)');
    expect(provider).not.toContain('setSession(data)');
    expect(provider).not.toContain('setSession(newSession)');
  });

  it('retains exactly one adaptive Guest session scheduling owner', () => {
    const provider = source('./guest-session-provider.tsx');
    expect(provider).toContain('nextGuestReadDelay(coordinator.snapshot');
    expect(provider).toContain('timer = setTimeout(');
    expect(provider).not.toContain('POLLING_INTERVAL_MS = 5_000');
    expect(source('./guest-request-coordinator.ts')).not.toContain('setInterval(');
  });
});
