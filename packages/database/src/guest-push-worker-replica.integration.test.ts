import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { GuestPushWorkerReplicaTestContext } from "./guest-push-worker-replica-test-context.js";

type ReplicaMode =
  | "ACCEPT"
  | "CRASH_AFTER_PROVIDER"
  | "HOLD_AFTER_PROVIDER"
  | "RACE"
  | "TRANSIENT";

interface ReplicaResult {
  readonly error?: string;
  readonly exitCode: number;
  readonly ok: boolean;
  readonly ran?: boolean;
  readonly ranCount?: number;
  readonly sendCount: number;
}

const context = new GuestPushWorkerReplicaTestContext();
const apiRoot = fileURLToPath(new URL("../../../apps/api/", import.meta.url));
const childScript = fileURLToPath(
  new URL("../../../apps/api/test/fixtures/guest-push-worker-replica-child.ts", import.meta.url),
);
const tsxCli = fileURLToPath(
  new URL("../../../apps/api/node_modules/tsx/dist/cli.mjs", import.meta.url),
);

function replicaProcess(mode: ReplicaMode) {
  return spawn(process.execPath, [tsxCli, childScript], {
    cwd: apiRoot,
    env: {
      ...process.env,
      GUEST_PUSH_TEST_DATABASE_URL: context.workerUrl,
      GUEST_PUSH_TEST_MODE: mode,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
}

function collectReplica(child: ReturnType<typeof replicaProcess>): Promise<ReplicaResult> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => (stdout += String(chunk)));
    child.stderr?.on("data", (chunk) => (stderr += String(chunk)));
    child.once("error", reject);
    child.once("close", (code) => {
      try {
        resolve({ ...JSON.parse(stdout), exitCode: code ?? -1 } as ReplicaResult);
      } catch {
        reject(new Error(`Replica child emitted invalid output: ${stderr}`));
      }
    });
  });
}

async function runReplica(mode: ReplicaMode): Promise<ReplicaResult> {
  return collectReplica(replicaProcess(mode));
}

function waitForAfterProvider(
  child: ReturnType<typeof replicaProcess>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Replacement replica did not reach provider result.")),
      10_000,
    );
    const onClose = (code: number | null) => {
      clearTimeout(timer);
      reject(new Error(`Replacement replica exited early with ${String(code)}.`));
    };
    child.once("close", onClose);
    child.once("message", (message) => {
      if (message !== "AFTER_PROVIDER") return;
      clearTimeout(timer);
      child.off("close", onClose);
      resolve();
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      child.off("close", onClose);
      reject(error);
    });
  });
}

async function deliveryRow(deliveryId: string) {
  const result = await context.adminClient.query<{
    attempt_count: number;
    lease_token: string | null;
    state: string;
  }>(
    `SELECT state::text, attempt_count, lease_token::text
     FROM guest_push_deliveries WHERE id = $1`,
    [deliveryId],
  );
  return result.rows[0]!;
}

beforeAll(() => context.setup(), 120_000);
beforeEach(async () => {
  await context.adminClient.query("DELETE FROM guest_push_deliveries");
  await context.adminClient.query("DELETE FROM guest_push_intents");
  await context.adminClient.query("DELETE FROM guest_push_registrations");
});
afterAll(() => context.teardown(), 60_000);

describe("Guest Push worker replica PostgreSQL fencing", () => {
  it("lets two competing restricted replicas produce one claim and one send", async () => {
    const fixture = await context.prepareDelivery("replica-race");
    const identity = await context.workerClient.query<{
      current_user: string;
      raw_endpoint_select: boolean;
    }>(
      `SELECT current_user,
              has_column_privilege(
                current_user,'guest_push_registrations','endpoint','SELECT'
              ) AS raw_endpoint_select`,
    );
    expect(identity.rows[0]).toEqual({
      current_user: context.workerRole,
      raw_endpoint_select: false,
    });

    const result = await runReplica("RACE");
    expect(result).toMatchObject({ exitCode: 0, ok: true, ranCount: 1, sendCount: 1 });
    expect(await deliveryRow(fixture.deliveryId)).toMatchObject({
      attempt_count: 1,
      lease_token: null,
      state: "PROVIDER_ACCEPTED",
    });
  });

  it("reclaims a crash lease and rejects the stale token while replacement owns it", async () => {
    const fixture = await context.prepareDelivery("crash-reclaim");
    const crashed = await runReplica("CRASH_AFTER_PROVIDER");
    expect(crashed).toMatchObject({
      error: "simulated sender crash",
      exitCode: 3,
      ok: false,
      sendCount: 1,
    });
    const firstLease = await deliveryRow(fixture.deliveryId);
    expect(firstLease).toMatchObject({ attempt_count: 1, state: "LEASED" });
    await context.expireLease(fixture.deliveryId);

    const replacement = replicaProcess("HOLD_AFTER_PROVIDER");
    const replacementResult = collectReplica(replacement);
    await waitForAfterProvider(replacement);
    try {
      const secondLease = await deliveryRow(fixture.deliveryId);
      expect(secondLease).toMatchObject({ attempt_count: 2, state: "LEASED" });
      expect(secondLease.lease_token).not.toBe(firstLease.lease_token);

      const stale = await context.workerClient.query(
        `UPDATE guest_push_deliveries
         SET state = 'PROVIDER_ACCEPTED', lease_token = NULL, lease_expires_at = NULL,
             provider_result_class = 'ACCEPTED', provider_accepted_at = clock_timestamp(),
             terminal_at = clock_timestamp(), updated_at = clock_timestamp()
         WHERE id = $1 AND state = 'LEASED' AND lease_token = $2`,
        [fixture.deliveryId, firstLease.lease_token],
      );
      expect(stale.rowCount).toBe(0);
    } finally {
      replacement.send("CONTINUE");
    }
    await expect(replacementResult).resolves.toMatchObject({
      exitCode: 0,
      ok: true,
      ran: true,
      sendCount: 1,
    });
    expect(await deliveryRow(fixture.deliveryId)).toMatchObject({
      attempt_count: 2,
      lease_token: null,
      state: "PROVIDER_ACCEPTED",
    });

    const domain = await context.adminClient.query<{
      deliveries: number;
      intents: number;
      ready_at: Date;
      state: string;
    }>(
      `SELECT session.state::text, session.ready_at,
              (SELECT count(*)::int FROM guest_push_intents
               WHERE valet_session_id = session.id) AS intents,
              (SELECT count(*)::int FROM guest_push_deliveries AS delivery
               INNER JOIN guest_push_intents AS intent ON intent.id = delivery.intent_id
               WHERE intent.valet_session_id = session.id) AS deliveries
       FROM valet_sessions AS session WHERE session.id = $1`,
      [fixture.sessionId],
    );
    expect(domain.rows[0]).toMatchObject({
      deliveries: 1,
      intents: 1,
      ready_at: fixture.readyAt,
      state: "READY",
    });
  });

  it("denies eligibility to an expired unreclaimed lease", async () => {
    const fixture = await context.prepareDelivery("expired-lease-fence");
    const crashed = await runReplica("CRASH_AFTER_PROVIDER");
    expect(crashed.sendCount).toBe(1);
    const lease = await deliveryRow(fixture.deliveryId);
    await context.expireLease(fixture.deliveryId);

    const eligible = await context.workerClient.query(
      `SELECT intent_id FROM guest_push_resolve_eligible_v1($1,$2,1)`,
      [fixture.deliveryId, lease.lease_token],
    );
    expect(eligible.rowCount).toBe(0);
  });

  it("expires instead of extending the immutable intent lifetime for retry", async () => {
    const fixture = await context.prepareDelivery("expiry");
    const expiresAt = await context.setIntentLifetime(fixture.intentId, 5);
    const result = await runReplica("TRANSIENT");
    expect(result).toMatchObject({ exitCode: 0, ok: true, ran: true, sendCount: 1 });
    expect(await deliveryRow(fixture.deliveryId)).toMatchObject({
      attempt_count: 1,
      lease_token: null,
      state: "EXPIRED",
    });
    const intent = await context.adminClient.query<{ expires_at: Date }>(
      "SELECT expires_at FROM guest_push_intents WHERE id = $1",
      [fixture.intentId],
    );
    expect(intent.rows[0]!.expires_at).toEqual(expiresAt);
    expect(await runReplica("ACCEPT")).toMatchObject({ ran: false, sendCount: 0 });
  });
});
