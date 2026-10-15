import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  WaPgMultiReplicaFixture, waPgAvailable, type WaPgSeed,
} from "./whatsapp-worker-multireplica-fixture";

describe.runIf(waPgAvailable)("WA-W4 two-replica cancel/withdraw and uncertain-send recovery", () => {
  const pg = new WaPgMultiReplicaFixture();
  beforeAll(() => pg.open(), 120_000);
  afterAll(() => pg.close(), 30_000);

  async function state(seed: WaPgSeed): Promise<{
    state: string; attempt_count: number; attempts: string; envelopes: string;
  }> {
    const { rows } = await pg.replicas[2]!.query<{
      state: string; attempt_count: number; attempts: string; envelopes: string;
    }>(`SELECT d.state,d.attempt_count,
      (SELECT count(*)::text FROM outbound_message_attempts a WHERE a.delivery_id=d.id) AS attempts,
      (SELECT count(*)::text FROM outbound_message_envelopes e WHERE e.intent_id=$2) AS envelopes
      FROM outbound_message_deliveries d WHERE d.id=$1`, [seed.delivery, seed.intent]);
    return rows[0]!;
  }

  it("cancellation by replica B before A's permit suppresses and purges without an attempt", async () => {
    const seed = await pg.seed();
    const claim = (await pg.claim(0))[0]!;
    expect(claim.delivery_id).toBe(seed.delivery);
    await pg.replicas[1]!.query(
      "UPDATE valet_sessions SET state='CANCELLED' WHERE id=$1", [seed.session]);
    expect((await pg.replicas[0]!.query("SELECT * FROM outbound_lease_recipient($1,$2)",
      [seed.delivery, claim.lease_token])).rows).toHaveLength(0);
    await expect(pg.permit(0, seed, claim)).rejects.toMatchObject({ code: "P0001" });
    const recovered = await pg.replicas[1]!.query<{ n: number }>(
      "SELECT outbound_recover_expired(100) AS n");
    expect(recovered.rows[0]?.n).toBe(1);
    expect(await state(seed)).toMatchObject({
      state: "SUPPRESSED", attempt_count: 0, attempts: "0", envelopes: "0",
    });
    expect(await pg.claim(0)).toEqual([]);
  });

  it("withdrawn consent during a blocked A permit commits before any attempt", async () => {
    const seed = await pg.seed();
    const claim = (await pg.claim(0))[0]!;
    const b = pg.replicas[1]!;
    await b.query("BEGIN");
    let finished = false;
    try {
      const permission = await b.query<{ id: string }>(`
        SELECT outbound_permission_change($1,$2,'synthetic-withdrawn-proof',
          NULL,NULL,1,'WITHDRAW') AS id`, [seed.org, seed.digest]);
      expect(permission.rows[0]?.id).toBe(seed.permission);
      const attempt = pg.permit(0, seed, claim).then(
        () => ({ ok: true as const }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      // The permit is forced behind the uncommitted permission-row lock.
      const beforeCommit = await Promise.race([
        attempt.then(() => "finished"),
        new Promise<string>((resolve) => setTimeout(() => resolve("blocked"), 60)),
      ]);
      expect(beforeCommit).toBe("blocked");
      await b.query("COMMIT");
      finished = true;
      const outcome = await attempt;
      expect(outcome).toMatchObject({ ok: false, error: { code: "P0001" } });
      const result = await b.query<{ n: number }>(
        "SELECT outbound_recover_expired(100) AS n");
      expect(result.rows[0]?.n).toBe(1);
      expect(await state(seed)).toMatchObject({
        state: "SUPPRESSED", attempt_count: 0, attempts: "0", envelopes: "0",
      });
      expect(await pg.claim(0)).toEqual([]);
    } finally {
      if (!finished) await b.query("ROLLBACK");
    }
  });

  it("cancel after durable DISPATCHING blocks confirmation, then expires to UNKNOWN", async () => {
    const seed = await pg.seed();
    const claim = (await pg.claim(0))[0]!;
    const permit = await pg.permit(0, seed, claim);
    expect(permit.attempt_id).toBeDefined();
    await pg.replicas[1]!.query(
      "UPDATE valet_sessions SET state='CANCELLED' WHERE id=$1", [seed.session]);
    const confirm = await pg.replicas[0]!.query<{ ok: boolean }>(
      "SELECT outbound_confirm_dispatch($1,$2,$3,$4,$5) AS ok",
      [seed.delivery, claim.lease_token, permit.attempt_id, seed.digest, permit.phone_normalized]);
    expect(confirm.rows[0]?.ok).toBe(false);
    expect(await state(seed)).toMatchObject({
      state: "DISPATCHING", attempt_count: 1, attempts: "1", envelopes: "1",
    });
    // A durable permit may have reached the provider; never requeue as NOT_SENT.
    await pg.replicas[2]!.query(`UPDATE outbound_message_deliveries SET
      lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1`,
    [seed.delivery]);
    const recovered = await pg.replicas[1]!.query<{ n: number }>(
      "SELECT outbound_recover_expired(100) AS n");
    expect(recovered.rows[0]?.n).toBe(1);
    expect(await state(seed)).toMatchObject({
      state: "UNKNOWN", attempt_count: 1, attempts: "1", envelopes: "0",
    });
    expect(await pg.claim(0)).toEqual([]);
    const oldFinalizer = await pg.replicas[0]!.query<{ ok: boolean }>(
      "SELECT outbound_finish_attempt($1,$2,$3,'DEFINITIVE_FAILURE',NULL,'REJECTED',NULL) AS ok",
      [seed.delivery, claim.lease_token, permit.attempt_id]);
    expect(oldFinalizer.rows[0]?.ok).toBe(false);
  });

  it("after replica A disconnects post-permit, B recovers UNKNOWN once without blind re-send", async () => {
    const seed = await pg.seed();
    const claim = (await pg.claim(0))[0]!;
    const permit = await pg.permit(0, seed, claim);
    const confirm = await pg.replicas[0]!.query<{ ok: boolean }>(
      "SELECT outbound_confirm_dispatch($1,$2,$3,$4,$5) AS ok",
      [seed.delivery, claim.lease_token, permit.attempt_id, seed.digest, permit.phone_normalized]);
    expect(confirm.rows[0]?.ok).toBe(true);
    // Deliberately terminate A's DB connection as a replica-crash boundary.
    await pg.replicas[0]!.end();
    expect(await pg.claim(1)).toEqual([]);
    await pg.replicas[2]!.query(`UPDATE outbound_message_deliveries SET
      lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1`,
    [seed.delivery]);
    const [first, second] = await Promise.all([
      pg.replicas[1]!.query<{ n: number }>("SELECT outbound_recover_expired(100) AS n"),
      pg.replicas[2]!.query<{ n: number }>("SELECT outbound_recover_expired(100) AS n"),
    ]);
    expect(first.rows[0]!.n + second.rows[0]!.n).toBe(1);
    expect(await state(seed)).toMatchObject({
      state: "UNKNOWN", attempt_count: 1, attempts: "1", envelopes: "0",
    });
    const attempt = await pg.replicas[2]!.query<{ state: string }>(
      "SELECT state FROM outbound_message_attempts WHERE id=$1", [permit.attempt_id]);
    expect(attempt.rows[0]?.state).toBe("UNKNOWN");
    expect(await pg.claim(1)).toEqual([]);
    const duplicate = await pg.replicas[1]!.query<{ n: number }>(
      "SELECT outbound_recover_expired(100) AS n");
    expect(duplicate.rows[0]?.n).toBe(0);
  });
});
