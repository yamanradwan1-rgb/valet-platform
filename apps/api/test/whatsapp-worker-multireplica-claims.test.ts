import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  WaPgMultiReplicaFixture, waPgAvailable,
  type WaPgClaim,
} from "./whatsapp-worker-multireplica-fixture";

describe.runIf(waPgAvailable)("WA-W4 real PostgreSQL two-replica claim and permit fences", () => {
  const pg = new WaPgMultiReplicaFixture();
  beforeAll(() => pg.open(), 120_000);
  afterAll(() => pg.close(), 30_000);

  async function retire(delivery: string): Promise<void> {
    // Fixture-only cleanup of undispatched jobs, never an application mutation.
    await pg.replicas[2]!.query(`UPDATE outbound_message_deliveries SET
      state='SUPPRESSED',lease_token=NULL,lease_expires_at=NULL,next_attempt_at=NULL
      WHERE id=$1 AND state IN ('PENDING','LEASED','RETRY_WAIT')`, [delivery]);
  }

  it("parallel replicas cannot claim the same PENDING job or replay a stolen lease", async () => {
    const seed = await pg.seed();
    const [a, b] = await Promise.all([pg.claim(0), pg.claim(1)]);
    expect(a.length + b.length).toBe(1);
    const winner = a[0] ?? b[0]!;
    expect(winner.delivery_id).toBe(seed.delivery);
    expect((await pg.claim(a.length ? 1 : 0))).toEqual([]);
    const stolen = await pg.replicas[2]!.query<{ allowed: boolean }>(
      "SELECT outbound_release_lease($1,$2,clock_timestamp()) AS allowed",
      [seed.delivery, "00000000-0000-4000-8000-000000000001"]);
    expect(stolen.rows[0]?.allowed).toBe(false);
    const wrongRecipient = await pg.replicas[2]!.query(
      "SELECT * FROM outbound_lease_recipient($1,$2)",
      [seed.delivery, "00000000-0000-4000-8000-000000000001"]);
    expect(wrongRecipient.rows).toHaveLength(0);
    const { rows } = await pg.replicas[2]!.query<{ attempt_count: number }>(
      "SELECT attempt_count FROM outbound_message_deliveries WHERE id=$1", [seed.delivery]);
    expect(rows[0]?.attempt_count).toBe(0);
    await retire(seed.delivery);
  });

  it("FOR UPDATE SKIP LOCKED permits only one worker across an open transaction", async () => {
    const seed = await pg.seed();
    const a = pg.replicas[0]!;
    await a.query("BEGIN");
    let rolledBack = false;
    try {
      const first = await pg.claim(0);
      expect(first.map((row) => row.delivery_id)).toEqual([seed.delivery]);
      await pg.replicas[1]!.query("SET statement_timeout='2000ms'");
      expect(await pg.claim(1)).toEqual([]);
      await a.query("ROLLBACK");
      rolledBack = true;
      const retry = await pg.claim(1);
      expect(retry.map((row) => row.delivery_id)).toEqual([seed.delivery]);
      expect(retry[0]?.lease_token).not.toBe(first[0]?.lease_token);
      await retire(seed.delivery);
    } finally {
      if (!rolledBack) await a.query("ROLLBACK");
      await pg.replicas[1]!.query("SET statement_timeout=0");
    }
  });

  it("expired lease can be reclaimed, but the first replica cannot dispatch or release it", async () => {
    const seed = await pg.seed();
    const old = (await pg.claim(0))[0]!;
    expect(old.delivery_id).toBe(seed.delivery);
    await pg.replicas[2]!.query(`UPDATE outbound_message_deliveries
      SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1`,
    [seed.delivery]);
    const current = (await pg.claim(1))[0]!;
    expect(current.delivery_id).toBe(seed.delivery);
    expect(current.lease_token).not.toBe(old.lease_token);
    const oldRelease = await pg.replicas[0]!.query<{ allowed: boolean }>(
      "SELECT outbound_release_lease($1,$2,clock_timestamp()) AS allowed",
      [seed.delivery, old.lease_token]);
    expect(oldRelease.rows[0]?.allowed).toBe(false);
    expect((await pg.replicas[0]!.query("SELECT * FROM outbound_lease_recipient($1,$2)",
      [seed.delivery, old.lease_token])).rows).toHaveLength(0);
    await expect(pg.permit(0, seed, old)).rejects.toMatchObject({ code: "P0001" });
    const permit = await pg.permit(1, seed, current);
    expect(permit?.attempt_id).toBeDefined();
    const oldConfirm = await pg.replicas[0]!.query<{ ok: boolean }>(
      "SELECT outbound_confirm_dispatch($1,$2,$3,$4,$5) AS ok",
      [seed.delivery, old.lease_token, permit.attempt_id, seed.digest, permit.phone_normalized]);
    expect(oldConfirm.rows[0]?.ok).toBe(false);
    const currentConfirm = await pg.replicas[1]!.query<{ ok: boolean }>(
      "SELECT outbound_confirm_dispatch($1,$2,$3,$4,$5) AS ok",
      [seed.delivery, current.lease_token, permit.attempt_id, seed.digest, permit.phone_normalized]);
    expect(currentConfirm.rows[0]?.ok).toBe(true);
    const finish = await pg.replicas[1]!.query<{ ok: boolean }>(
      "SELECT outbound_finish_attempt($1,$2,$3,'UNKNOWN',NULL,'TIMEOUT',NULL) AS ok",
      [seed.delivery, current.lease_token, permit.attempt_id]);
    expect(finish.rows[0]?.ok).toBe(true);
    const state = await pg.replicas[2]!.query<{ state: string; count: string }>(`
      SELECT d.state, (SELECT count(*)::text FROM outbound_message_envelopes e
      WHERE e.intent_id=$2) AS count FROM outbound_message_deliveries d WHERE d.id=$1`,
    [seed.delivery, seed.intent]);
    expect(state.rows[0]).toMatchObject({ state: "UNKNOWN", count: "0" });
    expect(await pg.claim(0)).toEqual([]);
  });

  it("parallel dispatch permits serialize against the same provider token budget", async () => {
    const first = await pg.seed();
    const second = await pg.addDelivery(first);
    await pg.replicas[2]!.query(`UPDATE outbound_message_budgets
      SET capacity=1,tokens=1,refill_per_second=0.001,last_refill_at=clock_timestamp()
      WHERE provider_binding_id=$1`, [first.binding]);
    const [claimA, claimB] = await Promise.all([pg.claim(0), pg.claim(1)]);
    expect(claimA).toHaveLength(1);
    expect(claimB).toHaveLength(1);
    expect(new Set([claimA[0]!.delivery_id, claimB[0]!.delivery_id]))
      .toEqual(new Set([first.delivery, second.delivery]));
    const sources = new Map([[first.delivery, first], [second.delivery, second]]);
    const dispatches = await Promise.allSettled([
      pg.permit(0, sources.get(claimA[0]!.delivery_id)!, claimA[0]!),
      pg.permit(1, sources.get(claimB[0]!.delivery_id)!, claimB[0]!),
    ]);
    expect(dispatches.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    const failure = dispatches.find((item) => item.status === "rejected");
    expect(failure).toMatchObject({
      status: "rejected",
      reason: { code: "P0001", message: "OUTBOUND_BUDGET_EXHAUSTED" },
    });
    const counts = await pg.replicas[2]!.query<{ attempts: number }>(`
      SELECT count(*)::integer AS attempts FROM outbound_message_attempts
      WHERE delivery_id=ANY($1::uuid[])`, [[first.delivery, second.delivery]]);
    expect(counts.rows[0]?.attempts).toBe(1);
    for (const [index, dispatch] of dispatches.entries()) {
      const claim = (index === 0 ? claimA : claimB)[0] as WaPgClaim;
      if (dispatch.status === "fulfilled") {
        const result = await pg.replicas[index]!.query(
          "SELECT outbound_finish_attempt($1,$2,$3,'UNKNOWN',NULL,'NETWORK',NULL)",
          [claim.delivery_id, claim.lease_token, dispatch.value.attempt_id]);
        expect(result.rowCount).toBe(1);
      } else {
        await retire(claim.delivery_id);
      }
    }
  });
});
