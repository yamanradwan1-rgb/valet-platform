import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

export {
  waitForLockWait,
  waitForAdvisoryLock,
} from "./management-settings-lock-observer";
import {
  waitForLockWait,
  waitForAdvisoryLock,
} from "./management-settings-lock-observer";

export const COMPANY_SETTING_MUTATION_QUERY =
  "management_settings_set_company_scalar";

export interface PendingCompanySettingMutation {
  readonly backendPid: number;
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
  if (updatedAt === undefined)
    throw new Error("Organization revision is missing.");
  return updatedAt;
}

function pendingMutation(
  client: PoolClient,
  mutation: Promise<unknown>,
  backendPid: number,
): PendingCompanySettingMutation {
  let closed = false;
  void mutation.catch(() => undefined);
  return {
    backendPid,
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
  return beginPreparedCompanySettingMutation(
    input,
    actorMembershipId,
    expectedUpdatedAt,
  );
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
  try {
    const backendPid = (
      await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
    ).rows[0]!.pid;
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
    return pendingMutation(client, mutation, backendPid);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    throw error;
  }
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
  let writer: PendingCompanySettingMutation | undefined;
  try {
    const blockerPid = (
      await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
    ).rows[0]!.pid;
    await blocker.query("BEGIN");
    await blocker.query(
      "SELECT id FROM organizations WHERE id = $1 FOR UPDATE",
      [input.organizationId],
    );
    writer = await beginPreparedCompanySettingMutation(
      input,
      actorMembershipId,
      expectedUpdatedAt,
    );
    await waitForAdvisoryLock(
      input.adminPool,
      { backendPid: writer.backendPid },
      "ExclusiveLock",
      true,
    );
    await waitForLockWait(input.adminPool, {
      blockerPid,
      waiterPid: writer.backendPid,
    });
  } catch (error) {
    await blocker.query("ROLLBACK").catch(() => undefined);
    blocker.release();
    await writer?.rollback().catch(() => undefined);
    throw error;
  }
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
    backendPid: writer.backendPid,
    async commit() {
      await releaseBlocker("COMMIT");
      await writer!.commit();
    },
    async rollback() {
      await releaseBlocker("ROLLBACK");
      await writer!.rollback();
    },
  };
}
