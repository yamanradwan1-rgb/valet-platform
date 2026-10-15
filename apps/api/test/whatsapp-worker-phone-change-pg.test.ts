import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PostgresPool } from "../src/common/database/postgres";
import { PostgresOutboundLeaseRepository } from
  "../src/modules/notifications/worker/outbound-postgres-repository";
import {
  WaPgMultiReplicaFixture, waPgAvailable, type WaPgSeed,
} from "./whatsapp-worker-multireplica-fixture";

describe.runIf(waPgAvailable)("WA-W4 F33: changed Customer phone never leaves a claimable outbox", () => {
  let pg: WaPgMultiReplicaFixture;
  // Each scenario has its own disposable database: a RED test cannot leave a
  // claimable row that masks a different regression in the next case.
  beforeEach(async () => {
    pg = new WaPgMultiReplicaFixture();
    await pg.open();
  }, 120_000);
  afterEach(async () => pg.close(), 30_000);

  async function customer(seed: WaPgSeed): Promise<{ id: string; phone_normalized: string }> {
    const { rows } = await pg.replicas[2]!.query<{ id: string; phone_normalized: string }>(`
      SELECT c.id,c.phone_normalized FROM customers c
      JOIN valet_sessions s ON s.customer_id=c.id AND s.organization_id=c.organization_id
      WHERE s.id=$1`, [seed.session]);
    return rows[0]!;
  }

  async function delivery(seed: WaPgSeed) {
    const { rows } = await pg.replicas[2]!.query<{
      state: string; attempt_count: number; envelopes: string; attempts: string;
    }>(`SELECT d.state,d.attempt_count,
      (SELECT count(*)::text FROM outbound_message_envelopes e
        WHERE e.intent_id=d.intent_id) AS envelopes,
      (SELECT count(*)::text FROM outbound_message_attempts a
        WHERE a.delivery_id=d.id) AS attempts
      FROM outbound_message_deliveries d WHERE d.id=$1`, [seed.delivery]);
    return rows[0]!;
  }

  async function changePhone(seed: WaPgSeed): Promise<void> {
    const before = await customer(seed);
    const last = before.phone_normalized.slice(-1);
    const changed = `${before.phone_normalized.slice(0, -1)}${last === "0" ? "1" : "0"}`;
    expect(changed).not.toBe(before.phone_normalized);
    await pg.replicas[1]!.query("UPDATE customers SET phone_normalized=$1 WHERE id=$2",
      [changed, before.id]);
  }

  it("phone edit before the first claim persists SUPPRESSED and purges sealed envelope", async () => {
    const seed = await pg.seed();
    expect(await delivery(seed)).toMatchObject({
      state: "PENDING", attempt_count: 0, attempts: "0", envelopes: "1",
    });
    await changePhone(seed);
    // The DB must prevent repeated claims even if no W4 worker is running.
    const recovered = await pg.replicas[2]!.query<{ n: number }>(
      "SELECT outbound_recover_expired(100) AS n");
    expect(recovered.rows[0]?.n).toBeGreaterThanOrEqual(0);
    expect(await delivery(seed)).toMatchObject({
      state: "SUPPRESSED", attempt_count: 0, attempts: "0", envelopes: "0",
    });
    expect(await pg.claim(0)).toEqual([]);
  });

  it("phone edit during LEASED cannot reopen after lease timeout or send a permit", async () => {
    const seed = await pg.seed();
    const original = await customer(seed);
    const claim = (await pg.claim(0))[0]!;
    expect(claim.delivery_id).toBe(seed.delivery);
    await changePhone(seed);
    const sender = new PostgresOutboundLeaseRepository(
      pg.replicas[0]! as unknown as PostgresPool,
      (phone) => phone === original.phone_normalized ? seed.digest :
        `hmac:v1:${"Z".repeat(43)}`,
      async () => undefined,
    );
    expect((await sender.prepareDispatch({
      deliveryId: claim.delivery_id,
      leaseToken: claim.lease_token,
      leaseExpiresAt: claim.lease_expires_at,
    })).kind).toMatch(/^(LOST_LEASE|SUPPRESSED)$/);
    expect(await delivery(seed)).toMatchObject({
      state: "SUPPRESSED", attempt_count: 0, attempts: "0", envelopes: "0",
    });
    await pg.replicas[2]!.query("SELECT outbound_recover_expired(100)");
    expect(await pg.claim(1)).toEqual([]);
  });

  it("no-op Customer phone update does not suppress eligible pending intent", async () => {
    const seed = await pg.seed();
    const current = await customer(seed);
    await pg.replicas[1]!.query(
      "UPDATE customers SET phone_normalized=$1 WHERE id=$2",
      [current.phone_normalized, current.id]);
    expect(await delivery(seed)).toMatchObject({
      state: "PENDING", attempt_count: 0, attempts: "0", envelopes: "1",
    });
    expect((await pg.claim(0)).map((row) => row.delivery_id)).toContain(seed.delivery);
  });

  it("phone change after durable permit blocks final confirm and can only recover UNKNOWN", async () => {
    const seed = await pg.seed();
    const claim = (await pg.claim(0))[0]!;
    const permit = await pg.permit(0, seed, claim);
    await changePhone(seed);
    const { rows } = await pg.replicas[0]!.query<{ ok: boolean }>(
      "SELECT outbound_confirm_dispatch($1,$2,$3,$4,$5) AS ok",
      [seed.delivery, claim.lease_token, permit.attempt_id, seed.digest, permit.phone_normalized]);
    expect(rows[0]?.ok).toBe(false);
    // A dispatch attempt already existed; never retroactively claim NOT_SENT.
    expect(await delivery(seed)).toMatchObject({
      state: "DISPATCHING", attempt_count: 1, attempts: "1", envelopes: "1",
    });
    await pg.replicas[2]!.query(`UPDATE outbound_message_deliveries
      SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1`,
    [seed.delivery]);
    expect((await pg.replicas[1]!.query<{ n: number }>(
      "SELECT outbound_recover_expired(100) AS n")).rows[0]?.n).toBe(1);
    expect(await delivery(seed)).toMatchObject({
      state: "UNKNOWN", attempt_count: 1, attempts: "1", envelopes: "0",
    });
    expect(await pg.claim(1)).toEqual([]);
  });

  it("held Customer lock serializes competing permit and phone update without send", async () => {
    const seed = await pg.seed();
    const current = await customer(seed);
    const claimed = (await pg.claim(0))[0]!;
    const a = pg.replicas[0]!, b = pg.replicas[1]!;
    await a.query("BEGIN");
    let committed = false;
    try {
      await a.query("SELECT id FROM customers WHERE id=$1 FOR UPDATE", [current.id]);
      const pendingPermit = pg.permit(1, seed, claimed).then(
        (value) => ({ kind: "permitted" as const, value }),
        (error: unknown) => ({ kind: "denied" as const, error }),
      );
      const race = await Promise.race([
        pendingPermit.then(() => "finished"),
        new Promise<string>((resolve) => setTimeout(() => resolve("blocked"), 70)),
      ]);
      expect(race).toBe("blocked");
      const last = current.phone_normalized.slice(-1);
      await a.query("UPDATE customers SET phone_normalized=$1 WHERE id=$2",
        [`${current.phone_normalized.slice(0, -1)}${last === "0" ? "1" : "0"}`, current.id]);
      await a.query("COMMIT");
      committed = true;
      expect(await pendingPermit).toMatchObject({
        kind: "denied", error: { code: "P0001" },
      });
      expect(await delivery(seed)).toMatchObject({
        state: "SUPPRESSED", attempt_count: 0, attempts: "0", envelopes: "0",
      });
      expect(await pg.claim(0)).toEqual([]);
    } finally {
      if (!committed) await a.query("ROLLBACK");
      await b.query("SET statement_timeout=0");
    }
  });

  it("a phone update waiting on an open claim commits safely after claim releases its row", async () => {
    const seed = await pg.seed();
    const current = await customer(seed);
    const a = pg.replicas[0]!, b = pg.replicas[1]!;
    await a.query("BEGIN");
    let committed = false;
    try {
      const lease = await pg.claim(0);
      expect(lease.map((row) => row.delivery_id)).toContain(seed.delivery);
      await b.query("SET statement_timeout='5000ms'");
      const last = current.phone_normalized.slice(-1);
      // Both blocking and fail-closed optimistic SQL implementations are valid;
      // neither is allowed to deadlock or to leave this intent claimable.
      const pendingUpdate = b.query("UPDATE customers SET phone_normalized=$1 WHERE id=$2",
        [`${current.phone_normalized.slice(0, -1)}${last === "0" ? "1" : "0"}`, current.id])
        .then(() => null, (error: unknown) => error);
      await new Promise((resolve) => setTimeout(resolve, 70));
      await a.query("COMMIT");
      committed = true;
      expect(await pendingUpdate).toBeNull();
      expect(await delivery(seed)).toMatchObject({
        state: "SUPPRESSED", attempt_count: 0, attempts: "0", envelopes: "0",
      });
      expect(await pg.claim(1)).toEqual([]);
    } finally {
      if (!committed) await a.query("ROLLBACK");
      await b.query("SET statement_timeout=0");
    }
  });
});
