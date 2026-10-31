import { Pool } from 'pg';
import { expect } from 'vitest';

import { ManagementControlPlaneTestFixture } from './management-control-plane-test-fixture';

export const fixture = new ManagementControlPlaneTestFixture();

export function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

export async function startIssue333Lab() {
  const url = process.env.TEST_DATABASE_URL ?? '';
  const directory = process.env.ISSUE333_PG_PRIVATE_DATADIR?.replaceAll('\\', '/');
  let target: URL;
  try { target = new URL(url); }
  catch { throw new Error('Issue333 requires an owned, disposable PostgreSQL URL.'); }
  if (process.platform !== 'win32' || process.env.CI === 'true' ||
      process.env.ISSUE333_EPHEMERAL_PG !== 'I_OWN_THIS_CLUSTER' ||
      url !== process.env.MIGRATION_DATABASE_URL ||
      target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' ||
      target.username !== 'issue315_owner' || target.pathname !== '/postgres' ||
      !target.password || target.search || target.hash ||
      Number(target.port) <= 1024 || Number(target.port) === 5432 ||
      !directory?.includes('/tmp/issue-315-pg-qa/issue319-') ||
      !directory.endsWith('/.issue315-private-cluster')) {
    throw new Error('Issue333 PostgreSQL test ownership attestation failed.');
  }
  const admin = new Pool({ connectionString: url, max: 2 });
  try {
    const result = await admin.query<{
      database: string; role: string; port: number; directory: string; version: number;
    }>(`SELECT current_database() AS database, current_user AS role,
      inet_server_port() AS port, current_setting('data_directory') AS directory,
      current_setting('server_version_num')::int AS version`);
    expect(result.rows[0]).toMatchObject({
      database: 'postgres', role: 'issue315_owner', port: Number(target.port),
    });
    expect(result.rows[0]!.directory.replaceAll('\\', '/')).toBe(directory);
    expect(result.rows[0]!.version).toBeGreaterThanOrEqual(170000);
    expect(result.rows[0]!.version).toBeLessThan(180000);
  } finally { await admin.end(); }
  await fixture.start();
  const runtime = new Pool({ connectionString: fixture.runtimeDatabaseUrl(), max: 2 });
  try {
    const result = await runtime.query<{
      rolsuper: boolean; rolcreatedb: boolean; rolcreaterole: boolean;
    }>(`SELECT rolsuper, rolcreatedb, rolcreaterole
      FROM pg_roles WHERE rolname=current_user`);
    expect(result.rows[0]).toEqual({
      rolsuper: false, rolcreatedb: false, rolcreaterole: false,
    });
  } finally { await runtime.end(); }
}

export async function stopIssue333Lab() {
  await fixture.stop();
}

export async function waitForPgBlockers(
  writerPid: number,
  expectedReaderPids: readonly number[],
  timeoutMs = 5000,
) {
  if (!Number.isInteger(writerPid) || expectedReaderPids.some((pid) => !Number.isInteger(pid))) {
    throw new Error('Expected exact numeric PostgreSQL backend PIDs.');
  }
  const expected = [...expectedReaderPids].sort((a, b) => a - b);
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const result = await fixture.query<{
      blockers: number[]; wait_type: string | null;
    }>(`SELECT pg_blocking_pids($1) AS blockers,
      (SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1) AS wait_type`,
    [writerPid]);
    const actual = [...(result.rows[0]?.blockers ?? [])].sort((a, b) => a - b);
    if (JSON.stringify(actual) === JSON.stringify(expected) &&
        (expected.length === 0 || result.rows[0]?.wait_type === 'Lock')) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Real PostgreSQL blocker set did not converge for backend ${writerPid}.`);
}
