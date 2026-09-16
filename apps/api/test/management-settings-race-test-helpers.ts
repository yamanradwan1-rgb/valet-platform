import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

export const COMPANY_SETTING_MUTATION_QUERY =
  "management_settings_set_company_scalar";

type AdvisoryMode = "ExclusiveLock" | "ShareLock";

export interface PendingCompanySettingMutation {
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export type BlockedCompanySettingMutation = PendingCompanySettingMutation;

async function createManagementSettingsActor(
  pool: Pool,
  organizationId: string,
): Promise<string> {
  const userId = randomUUID();
  const membershipId = randomUUID();
  await pool.query(
    `INSERT INTO users (id, email, password_hash, status, updated_at)
     VALUES ($1, $2, 'not-real', 'ACTIVE', transaction_timestamp())`,
    [userId, `${randomUUID()}@be05-race.test`],
  );
  await pool.query(
    `INSERT INTO organization_memberships
       (id, organization_id, user_id, role, status, updated_at)
     VALUES ($1, $2, $3, 'ORG_ADMIN', 'ACTIVE', transaction_timestamp())`,
    [membershipId, organizationId, userId],
  );
  return membershipId;
}

async function organizationUpdatedAt(
  pool: Pool,
  organizationId: string,
): Promise<Date> {
  const result = await pool.query<{ updated_at: Date }>(
    `SELECT updated_at FROM organizations WHERE id = $1`,
    [organizationId],
  );
  const updatedAt = result.rows[0]?.updated_at;
  if (updatedAt === undefined) throw new Error("Organization revision is missing.");
  return updatedAt;
}

async function waitForDatabaseCondition(
  check: () => Promise<boolean>,
  description: string,
): Promise<void> {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    if (await check()) return;
  }
  throw new Error(`Expected PostgreSQL state: ${description}.`);
}

export function waitForLockWait(pool: Pool, queryFragment: string): Promise<void> {
  return waitForDatabaseCondition(async () => {
    const result = await pool.query<{ waiting: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_stat_activity
         WHERE datname = current_database()
           AND state = 'active'
           AND wait_event_type = 'Lock'
           AND query ILIKE $1
       ) AS waiting`,
      [`%${queryFragment}%`],
    );
    return result.rows[0]?.waiting === true;
  }, `lock wait for ${queryFragment}`);
}

export function waitForAdvisoryLock(
  pool: Pool,
  queryFragment: string,
  mode: AdvisoryMode,
  granted: boolean,
): Promise<void> {
  return waitForDatabaseCondition(async () => {
    const result = await pool.query<{ matched: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM pg_stat_activity AS activity
         INNER JOIN pg_locks AS held ON held.pid = activity.pid
         WHERE activity.datname = current_database()
           AND activity.state = 'active'
           AND activity.query ILIKE $1
           AND held.locktype = 'advisory'
           AND held.mode = $2
           AND held.granted = $3
       ) AS matched`,
      [`%${queryFragment}%`, mode, granted],
    );
    return result.rows[0]?.matched === true;
  }, `${granted ? "granted" : "waiting"} ${mode} for ${queryFragment}`);
}

function pendingMutation(
  client: PoolClient,
  mutation: Promise<unknown>,
): PendingCompanySettingMutation {
  let closed = false;
  void mutation.catch(() => undefined);
  return {
    async commit() {
      if (closed) return;
      try {
        await mutation;
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        closed = true;
        client.release();
      }
    },
    async rollback() {
      if (closed) return;
      try {
        await client.query("ROLLBACK");
      } finally {
        closed = true;
        client.release();
      }
    },
  };
}

export async function beginCompanySettingMutation(input: {
  readonly adminPool: Pool;
  readonly organizationId: string;
  readonly runtimePool: Pool;
  readonly setting: string;
  readonly value: string;
}): Promise<PendingCompanySettingMutation> {
  const actorMembershipId = await createManagementSettingsActor(
    input.adminPool,
    input.organizationId,
  );
  const expectedUpdatedAt = await organizationUpdatedAt(
    input.adminPool,
    input.organizationId,
  );
  return beginPreparedCompanySettingMutation(input, actorMembershipId, expectedUpdatedAt);
}

async function beginPreparedCompanySettingMutation(
  input: {
    readonly runtimePool: Pool;
    readonly organizationId: string;
    readonly setting: string;
    readonly value: string;
  },
  actorMembershipId: string,
  expectedUpdatedAt: Date,
): Promise<PendingCompanySettingMutation> {
  const client = await input.runtimePool.connect();
  await client.query("BEGIN");
  const mutation = client.query(
    `SELECT * FROM management_settings_set_company_scalar(
       $1::uuid,$2::uuid,$3::text,$4::text,$5::timestamptz)`,
    [
      actorMembershipId,
      input.organizationId,
      input.setting,
      input.value,
      expectedUpdatedAt,
    ],
  );
  return pendingMutation(client, mutation);
}

export async function beginBlockedCompanySettingMutation(input: {
  readonly adminPool: Pool;
  readonly organizationId: string;
  readonly runtimePool: Pool;
  readonly setting: string;
  readonly value: string;
}): Promise<BlockedCompanySettingMutation> {
  const actorMembershipId = await createManagementSettingsActor(
    input.adminPool,
    input.organizationId,
  );
  const expectedUpdatedAt = await organizationUpdatedAt(
    input.adminPool,
    input.organizationId,
  );
  const blocker = await input.adminPool.connect();
  await blocker.query("BEGIN");
  await blocker.query(
    `SELECT id FROM organizations WHERE id = $1 FOR UPDATE`,
    [input.organizationId],
  );
  const writer = await beginPreparedCompanySettingMutation(
    input,
    actorMembershipId,
    expectedUpdatedAt,
  );
  await waitForAdvisoryLock(
    input.adminPool,
    COMPANY_SETTING_MUTATION_QUERY,
    "ExclusiveLock",
    true,
  );
  await waitForLockWait(input.adminPool, COMPANY_SETTING_MUTATION_QUERY);
  let blockerClosed = false;
  const releaseBlocker = async (resolution: "COMMIT" | "ROLLBACK") => {
    if (blockerClosed) return;
    try {
      await blocker.query(resolution);
    } finally {
      blockerClosed = true;
      blocker.release();
    }
  };
  return {
    async commit() {
      await releaseBlocker("COMMIT");
      await writer.commit();
    },
    async rollback() {
      await releaseBlocker("ROLLBACK");
      await writer.rollback();
    },
  };
}
