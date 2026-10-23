import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Pool, type PoolClient } from 'pg';
import { expect } from 'vitest';

import { ManagementControlPlaneTestFixture } from './management-control-plane-test-fixture';

export const fixture = new ManagementControlPlaneTestFixture();
export const trace: { event: string; ms: number }[] = [];
export function event(name: string) {
  trace.push({ event: name, ms: Number(performance.now().toFixed(3)) });
}
export function latch() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

export async function startLab() {
  const url = process.env.TEST_DATABASE_URL ?? '';
  const directory = process.env.ISSUE315_PG_PRIVATE_DATADIR?.replaceAll('\\', '/');
  const target = new URL(url);
  if (process.env.ISSUE319_EPHEMERAL_PG !== 'I_OWN_THIS_CLUSTER' ||
      process.env.CI === 'true' || url !== process.env.MIGRATION_DATABASE_URL ||
      target.hostname !== '127.0.0.1' || target.username !== 'issue315_owner' ||
      target.pathname !== '/postgres' || !target.password ||
      Number(target.port) < 1024 || [5432, 55449].includes(Number(target.port)) ||
      !directory?.includes('/tmp/issue-315-pg-qa/issue319-') ||
      !directory.endsWith('/.issue315-private-cluster')) {
    throw new Error('Issue319 requires its explicitly owned private cluster.');
  }
  const parent = new Pool({ connectionString: url });
  try {
    const result = await parent.query(`SELECT current_database() AS db,
      current_user AS owner, inet_server_port() AS port,
      current_setting('data_directory') AS directory, version()`);
    expect(result.rows[0]).toMatchObject({ db: 'postgres', owner: 'issue315_owner',
      port: Number(target.port) });
    expect(result.rows[0].directory.replaceAll('\\', '/')).toBe(directory);
  } finally { await parent.end(); }
  await fixture.start();
  const runtime = new Pool({ connectionString: fixture.runtimeDatabaseUrl() });
  try {
    const identity = await runtime.query(`SELECT current_database() AS db,
      current_user AS runtime, rolsuper, rolcreatedb, rolcreaterole,
      pg_get_userbyid(datdba) AS owner
      FROM pg_roles JOIN pg_database ON datname=current_database()
      WHERE rolname=current_user`);
    expect(identity.rows[0]).toMatchObject({ rolsuper: false, rolcreatedb: false,
      rolcreaterole: false, owner: 'issue315_owner' });
    console.log('ISSUE319_RUNTIME_IDENTITY', identity.rows[0]);
  } finally { await runtime.end(); }
}

export async function actor(role: 'LOCATION_MANAGER' | 'ORG_ADMIN' |
  'VALET_SUPERVISOR' | 'VALET_EMPLOYEE' = 'LOCATION_MANAGER', assure = true) {
  const user = await fixture.createUser();
  const member = await fixture.createMembership(user.id, { role });
  const location = await fixture.addLocation(member.organizationId);
  await fixture.query(`INSERT INTO membership_location_access
    (organization_id,membership_id,location_id) VALUES($1,$2,$3)`,
  [member.organizationId, member.membershipId, location.locationId]);
  const auth = await fixture.nativeLogin(user);
  if (role === 'ORG_ADMIN' && assure) await fixture.enrollAndAssure(auth);
  const keySlotId = randomUUID();
  await fixture.query(`INSERT INTO key_slots
    (id,organization_id,location_id,code,status,updated_at)
    VALUES($1,$2,$3,'ISSUE319-SYNTHETIC-KEY','ACTIVE',clock_timestamp())`,
  [keySlotId, member.organizationId, location.locationId]);
  return { user, ...member, ...location, auth, keySlotId };
}
export type Actor = Awaited<ReturnType<typeof actor>>;
export const physicalPath = (a: Actor, suffix = 'key-slots') =>
  `/v1/staff/dashboard/locations/${a.locationId}/physical-resources/${suffix}`;
export const overviewPath = (a: Actor) =>
  `/v1/staff/dashboard/locations/${a.locationId}/overview/keys`;
export const discoveryPath = (a: Actor) =>
  `/v1/staff/dashboard/organizations/${a.organizationId}/locations`;

export async function grantWriter(a: Actor, client?: PoolClient) {
  const admin = await fixture.createUser();
  const adminId = await fixture.addMembership(a.organizationId, admin.id, 'ORG_ADMIN');
  const current = await fixture.query<{ version: number }>(
    'SELECT version FROM organization_memberships WHERE id=$1', [a.membershipId]);
  const runtime = client ? undefined : new Pool({ connectionString: fixture.runtimeDatabaseUrl() });
  try {
    const result = await (client ?? runtime!).query(`SELECT result_code
      FROM staff_management_set_location_access($1,$2,$3,$4,$5,false)`,
    [adminId, a.organizationId, a.membershipId, current.rows[0]!.version, [a.locationId]]);
    expect(result.rows[0]?.result_code).toBe('OK');
    event('CANONICAL_GRANT_WRITER_SQL_COMPLETE');
  } finally { await runtime?.end(); }
}

export async function logout(a: Actor) {
  event('LOGOUT_REQUEST_START');
  const result = await fixture.request('/v1/staff/auth/native/logout', {
    body: { refreshToken: a.auth.refreshToken },
  });
  expect(result.status).toBe(204);
  event('LOGOUT_HTTP_COMPLETE_AFTER_COMMIT');
}

export async function waitForLock(pid: number) {
  const until = performance.now() + 1200;
  while (performance.now() < until) {
    const result = await fixture.query<{ waiting: boolean }>(
      `SELECT wait_event_type='Lock' AS waiting FROM pg_stat_activity WHERE pid=$1`, [pid]);
    if (result.rows[0]?.waiting) { event('POSTGRES_LOCK_WAIT_OBSERVED'); return; }
    await new Promise((done) => setTimeout(done, 5));
  }
  throw new Error('Expected observable PostgreSQL lock wait was absent.');
}
