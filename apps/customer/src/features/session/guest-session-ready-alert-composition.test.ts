import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('Guest READY alert composition', () => {
  it('applies fetch and updateSession snapshots through one tracker boundary', () => {
    const provider = source('./guest-session-provider.tsx');
    expect(provider.match(/applyAuthorizedSessionSnapshot\(/gu)).toHaveLength(2);
    expect(provider).toContain('applyAuthorizedSessionSnapshot(data)');
    expect(provider).toContain('applyAuthorizedSessionSnapshot(newSession)');
    expect(provider).not.toContain('setSession(data)');
    expect(provider).not.toContain('setSession(newSession)');
  });

  it('retains exactly one five-second Guest session polling owner', () => {
    const provider = source('./guest-session-provider.tsx');
    const customerSourceFiles = [
      provider,
      source('../../app/guest-app-root.tsx'),
      source('./use-guest-session.ts'),
    ].join('\n');
    expect(customerSourceFiles.match(/setInterval\s*\(/gu)).toHaveLength(1);
    expect(provider).toContain('const POLLING_INTERVAL_MS = 5_000');
  });
});
