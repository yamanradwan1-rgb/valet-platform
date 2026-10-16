import type { Pool } from "pg";

import type { PostgresPool } from "../src/common/database/postgres";

interface DatabaseContext {
  readonly adminPool: Pool;
}

interface CommandResult {
  readonly error?: { code?: string };
  readonly succeeded: boolean;
}

async function waitForPidBlockedBy(
  pool: Pool, blockerPid: number,
): Promise<boolean> {
  for (let attempt = 0; attempt < 400; attempt++) {
    const result = await pool.query<{ blocked: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_stat_activity
         WHERE datname = current_database()
           AND $1::integer = ANY(pg_blocking_pids(pid))
       ) AS blocked`,
      [blockerPid],
    );
    if (result.rows[0]?.blocked === true) return true;
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }
  return false;
}

/**
 * Confirm the command is physically blocked by the still-uncommitted demotion
 * using PostgreSQL's blocking PID graph, then commit the demotion before the
 * command can obtain its protected membership role.
 */
export async function commitDemotionAheadOfBlockedCommand(
  context: DatabaseContext,
  membershipId: string,
  operation: () => Promise<unknown>,
): Promise<CommandResult> {
  const transaction = await context.adminPool.connect();
  let committed = false;
  let pending: Promise<CommandResult> | undefined;
  try {
    await transaction.query("BEGIN");
    const blocker = await transaction.query<{ pid: number }>(
      "SELECT pg_backend_pid() AS pid",
    );
    const blockerPid = blocker.rows[0]!.pid;
    await transaction.query(
      `UPDATE organization_memberships
       SET role = 'VALET_EMPLOYEE', updated_at = transaction_timestamp()
       WHERE id = $1`,
      [membershipId],
    );

    pending = operation().then(
      () => ({ succeeded: true }),
      (error: unknown) => ({
        error: error as { code?: string },
        succeeded: false,
      }),
    );

    if (!(await waitForPidBlockedBy(context.adminPool, blockerPid))) {
      throw new Error("Supervisor operation never blocked on the demotion row lock.");
    }
    await transaction.query("COMMIT");
    committed = true;
    return await pending;
  } finally {
    if (!committed) {
      await transaction.query("ROLLBACK");
      await pending;
    }
    transaction.release();
  }
}

/**
 * Opposite serialization: hold the command after PostgreSQL has granted its
 * locked current role. Verify the demotion UPDATE waits for this exact lock,
 * then permit the command to commit before demotion can succeed.
 */
export async function commandCompletesAheadOfBlockedDemotion(
  context: DatabaseContext & { readonly runtimePool: PostgresPool },
  membershipId: string,
  operation: (pool: PostgresPool) => Promise<unknown>,
): Promise<void> {
  let signalLocked!: () => void;
  let releaseCommand!: () => void;
  let commandPid = 0;
  const locked = new Promise<void>((resolve) => { signalLocked = resolve; });
  const proceed = new Promise<void>((resolve) => { releaseCommand = resolve; });
  const instrumented = {
    connect: async () => {
      const client = await context.runtimePool.connect();
      const pid = await client.query<{ pid: number }>(
        "SELECT pg_backend_pid() AS pid",
      );
      commandPid = pid.rows[0]!.pid;
      return {
        query: async (...args: Parameters<typeof client.query>) => {
          const result = await client.query(...args);
          if (
            typeof args[0] === "string" &&
            args[0].includes("SELECT role::text FROM organization_memberships") &&
            args[0].includes("FOR SHARE")
          ) {
            signalLocked();
            await proceed;
          }
          return result;
        },
        release: () => client.release(),
      };
    },
  } as unknown as PostgresPool;

  const command = operation(instrumented);
  let demotion: Promise<unknown> | undefined;
  const admin = await context.adminPool.connect();
  try {
    await locked;
    demotion = admin.query(
      `UPDATE organization_memberships
       SET role = 'VALET_EMPLOYEE', updated_at = transaction_timestamp()
       WHERE id = $1`,
      [membershipId],
    );
    const isBlocked = await waitForPidBlockedBy(context.adminPool, commandPid);
    if (!isBlocked) throw new Error("Demotion failed to wait on command's role lock.");
  } finally {
    releaseCommand();
  }
  try {
    await command;
    await demotion;
  } finally {
    admin.release();
  }
}
