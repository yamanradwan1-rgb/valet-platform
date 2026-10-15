import { describe, expect, it, vi } from "vitest";
import type { PostgresPool } from "../src/common/database/postgres";
import { PostgresOutboundLeaseRepository } from "../src/modules/notifications/worker/outbound-postgres-repository";
import { canonicalOutboundSenderLabel } from "../src/modules/notifications/worker/outbound-worker-envelope-opener";
import type { OutboundPgPermitRow } from "../src/modules/notifications/worker/outbound-postgres-types";
import { syntheticClaim } from "./whatsapp-worker-fixture";

const recipientDigest = "hmac:v1:" + "T".repeat(43);
const attemptId = "88888888-8888-4888-8888-888888888888";
const now = new Date("2026-10-16T00:00:00.000Z");
const aad = {
  version: 1 as const,
  organizationId: "33333333-3333-4333-8333-333333333333",
  locationId: "44444444-4444-4444-8444-444444444444",
  sessionId: "55555555-5555-4555-8555-555555555555",
  customerId: "66666666-6666-4666-8666-666666666666",
  intentId: "77777777-7777-4777-8777-777777777777",
  credentialGeneration: 1,
  recipientDigest,
  expiresAt: now.toISOString(),
};

const permit: OutboundPgPermitRow = {
  attempt_id: attemptId,
  callback_handle: "99999999-9999-4999-8999-999999999999",
  remaining_seconds: "24.000",
  phone_normalized: "+962799123456",
  recipient_digest: recipientDigest,
  ciphertext: Buffer.alloc(384, 7),
  aad_label: canonicalOutboundSenderLabel(aad),
  aad_version: 1,
  key_version: "synthetic-sender-key",
  organization_id: "33333333-3333-4333-8333-333333333333",
  location_id: "44444444-4444-4444-8444-444444444444",
  valet_session_id: "55555555-5555-4555-8555-555555555555",
  customer_id: "66666666-6666-4666-8666-666666666666",
  intent_id: "77777777-7777-4777-8777-777777777777",
  credential_generation: 1,
  expires_at: now,
  binding_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  phone_number_id: "123456789",
  waba_id: "456789123",
  provider_environment: "test",
  template_catalog_version: "test-v1",
  language: "ar",
  config_alias: "synthetic-config",
};

function postgresFake() {
  const rows = new Map<string, object[]>([
    ["outbound_claim_due", [{
      delivery_id: syntheticClaim.deliveryId,
      lease_token: syntheticClaim.leaseToken,
      lease_expires_at: syntheticClaim.leaseExpiresAt,
    }]],
    ["outbound_lease_recipient", [{
      phone_normalized: "+962799123456",
      recipient_digest: recipientDigest,
    }]],
    ["outbound_dispatch_permit", [permit]],
    ["outbound_confirm_dispatch", [{ allowed: true }]],
    ["outbound_finish_attempt", [{ finished: true }]],
    ["outbound_recover_expired", [{ recovered: 2 }]],
    ["outbound_purge_expired_envelopes", [{ purged: 3 }]],
  ]);
  const query = vi.fn(async (sql: string, _args?: unknown[]) => {
    void _args;
    const match = sql.match(/public\.(outbound_[a-z_]+)/);
    const payload = rows.get(match?.[1] ?? "") ?? [];
    return { rows: payload, rowCount: payload.length };
  });
  const config = vi.fn(async () => ({
    bindingId: permit.binding_id,
    phoneNumberId: permit.phone_number_id,
    wabaId: permit.waba_id,
    environment: "test" as const,
    accessToken: "synthetic-provider-secret",
    graphVersion: "v26.0",
    templateName: "guest_initial_access",
    templateVersion: "test-v1",
    language: "ar" as const,
  }));
  const digest = vi.fn(() => recipientDigest);
  const repository = new PostgresOutboundLeaseRepository(
    { query } as unknown as PostgresPool,
    digest,
    config,
  );
  return { query, rows, config, digest, repository };
}

describe("WhatsApp sender-restricted PostgreSQL function boundary", () => {
  it("claims only through W1's authorized bounded lease function", async () => {
    const fakes = postgresFake();
    expect(await fakes.repository.claimDue(10)).toEqual([syntheticClaim]);
    expect(fakes.query).toHaveBeenCalledWith(
      expect.stringContaining("public.outbound_claim_due($1)"), [10],
    );
  });

  it("re-HMACs the canonical current phone and blocks stale recipient snapshots", async () => {
    const fakes = postgresFake();
    fakes.digest.mockReturnValue("hmac:v1:" + "Z".repeat(43));
    await expect(fakes.repository.prepareDispatch(syntheticClaim))
      .resolves.toEqual({ kind: "SUPPRESSED" });
    expect(fakes.query.mock.calls.some(([sql]) => sql.includes("outbound_dispatch_permit")))
      .toBe(false);
  });

  it("commits the SQL permit, binds scope to immutable AAD and erases cached bytes", async () => {
    const fakes = postgresFake();
    const result = await fakes.repository.prepareDispatch(syntheticClaim);
    expect(result).toEqual({
      kind: "DISPATCH", attemptId, attemptHandle: permit.callback_handle, remainingMs: 24_000,
    });
    const material = await fakes.repository.loadForPermit(syntheticClaim, attemptId);
    expect(material?.expectedAAD).toEqual({
      version: 1,
      organizationId: permit.organization_id,
      locationId: permit.location_id,
      sessionId: permit.valet_session_id,
      customerId: permit.customer_id,
      intentId: permit.intent_id,
      credentialGeneration: 1,
      recipientDigest,
      expiresAt: now.toISOString(),
    });
    expect(material?.sealed.ciphertext).toEqual(permit.ciphertext);
    expect(await fakes.repository.confirmPermit(syntheticClaim, attemptId))
      .toEqual({ remainingMs: 10_001 });
    expect(fakes.query.mock.calls.some(([sql]) => sql.includes("outbound_confirm_dispatch")))
      .toBe(true);
    expect(fakes.query).toHaveBeenCalledWith(
      expect.stringContaining("outbound_confirm_dispatch($1,$2,$3,$4,$5)"),
      [syntheticClaim.deliveryId, syntheticClaim.leaseToken, attemptId,
        recipientDigest, permit.phone_normalized],
    );
    fakes.repository.forgetPermit(attemptId);
    expect(await fakes.repository.loadForPermit(syntheticClaim, attemptId)).toBeUndefined();
  });

  it("fails closed if SQL omits verified AAD or account binding metadata", async () => {
    const fakes = postgresFake();
    fakes.rows.set("outbound_dispatch_permit", [{
      ...permit,
      organization_id: undefined,
    }]);
    await expect(fakes.repository.prepareDispatch(syntheticClaim))
      .rejects.toThrow("OUTBOUND_PERMIT_PROJECTION_INVALID");
    expect(await fakes.repository.loadForPermit(syntheticClaim, attemptId)).toBeUndefined();
  });

  it("requires the exact issuer AAD bytes from the trusted SQL permit", async () => {
    const fakes = postgresFake();
    fakes.rows.set("outbound_dispatch_permit", [{
      ...permit,
      aad_label: Buffer.from("{}"),
    }]);
    await expect(fakes.repository.prepareDispatch(syntheticClaim))
      .rejects.toThrow("OUTBOUND_PERMIT_AAD_LABEL_MISMATCH");
  });

  it("persists recipient/provider budget denials without consuming a dispatch permit", async () => {
    const fakes = postgresFake();
    fakes.query.mockImplementation(async (sql: string) => {
      if (sql.includes("outbound_lease_recipient")) return {
        rows: [{ phone_normalized: permit.phone_normalized, recipient_digest: recipientDigest }],
      } as never;
      if (sql.includes("outbound_dispatch_permit")) {
        throw Object.assign(new Error("OUTBOUND_RECIPIENT_THROTTLED"), { code: "P0001" });
      }
      return { rows: [{ outbound_release_lease: true }] } as never;
    });
    expect(await fakes.repository.prepareDispatch(syntheticClaim))
      .toEqual({ kind: "RATE_LIMITED" });
    expect(fakes.query.mock.calls.some(([sql]) => sql.includes("outbound_release_lease")))
      .toBe(true);
  });

  it("maps definite nonacceptance and uncertain outcomes to distinct SQL terminal codes", async () => {
    const fakes = postgresFake();
    await fakes.repository.finalizeAttempt(syntheticClaim, attemptId,
      { kind: "NOT_ACCEPTED", reason: "RATE_LIMIT", retryAfterSeconds: 120 });
    expect(fakes.query).toHaveBeenCalledWith(
      expect.stringContaining("public.outbound_finish_attempt"),
      [syntheticClaim.deliveryId, syntheticClaim.leaseToken, attemptId,
        "DEFINITIVE_FAILURE", null, "RATE_LIMIT", 120],
    );
    await fakes.repository.finalizeAttempt(syntheticClaim, attemptId,
      { kind: "UNKNOWN", reason: "TIMEOUT" });
    expect(fakes.query).toHaveBeenCalledWith(
      expect.stringContaining("public.outbound_finish_attempt"),
      [syntheticClaim.deliveryId, syntheticClaim.leaseToken, attemptId,
        "UNKNOWN", null, "TIMEOUT", null],
    );
  });

  it("runs bounded state recovery then encrypted-secret purge without deleting history", async () => {
    const fakes = postgresFake();
    expect(await fakes.repository.expireAndPurge(100)).toBe(5);
    expect(fakes.query.mock.calls.map(([sql]) => sql)).toEqual([
      "SELECT public.outbound_recover_expired($1) AS recovered",
      "SELECT public.outbound_purge_expired_envelopes($1) AS purged",
    ]);
  });
});
