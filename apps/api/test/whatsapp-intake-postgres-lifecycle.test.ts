import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createRevokeGuestAccessCommandExecutor } from "../src/modules/valet-sessions/guest-access-command";
import { createIntakeSessionCommandExecutor } from "../src/modules/valet-sessions/intake-session-command";
import { useIntakeSessionCommandTestHarness } from "./intake-session-command-test-harness";
import {
  configureVerifiedIssuance,
  readIssuedRows,
  verifiedIssuanceHook,
} from "./whatsapp-issuance-fixture";

// This suite requires W1 migration 086 + runtime-role grant integration (G1).
// W2's isolated checkout intentionally contains no W1-owned migration.
describe.skipIf(process.env.WHATSAPP_W1_MIGRATED !== "1")(
  "W2 real PostgreSQL Intake atomic issuing after W1 integration",
  () => {
    const harness = useIntakeSessionCommandTestHarness();
    const issue = () => {
      if (verifiedIssuanceHook === null) {
        throw new Error("Synthetic W2 encryption fixture was not initialized.");
      }
      return createIntakeSessionCommandExecutor(harness.runtimePool, {
        initialGuestIssuance: verifiedIssuanceHook,
      });
    };

    it("issues one credential/intent/delivery with verified consent; replay and revoke never reissue", async () => {
      const fixture = await harness.createFixture();
      await configureVerifiedIssuance(harness.adminPool, fixture, "+962790000000");
      const request = harness.temporaryRequest(fixture, {
        customer: { intent: "DIFFERENT_CUSTOMER", phone: "+962790000000" },
      });
      const execute = issue();
      const first = await execute(request);
      const wrongScope = await harness.runtimePool.query<{ phone_normalized: string }>(
        `SELECT phone_normalized FROM outbound_read_intake_customer($1, $2, $3)`,
        [fixture.organizationId, first.valetSessionId, randomUUID()],
      );
      expect(wrongScope.rows).toHaveLength(0);
      const wrongTenant = await harness.runtimePool.query<{ phone_normalized: string }>(
        `SELECT phone_normalized FROM outbound_read_intake_customer($1, $2, $3)`,
        [randomUUID(), first.valetSessionId, first.customerId],
      );
      expect(wrongTenant.rows).toHaveLength(0);
      const rows = await readIssuedRows(harness.adminPool, first.valetSessionId);
      expect(rows.session?.customer_access_generation).toBe(1);
      expect(rows.session?.customer_access_revoked_at).toBeNull();
      expect(rows.session?.customer_access_token_hash).toMatch(/^sha256:v1:[0-9a-f]{64}$/);
      expect(rows.intents).toHaveLength(1);
      expect(rows.intents[0]?.credential_generation).toBe(1);
      expect(rows.deliveries).toEqual([{ state: "PENDING" }]);
      expect(rows.envelopes).toHaveLength(1);
      expect(rows.envelopes[0]?.ciphertext.byteLength).toBe(384);
      expect(rows.audit.map((row) => row.event_type)).toContain("GUEST_ACCESS_ISSUED");
      const responseJson = JSON.stringify(first);
      expect(responseJson).not.toContain("customer_access_token_hash");
      expect(responseJson).not.toContain("guestToken");
      expect(await execute(request)).toEqual(first);
      const afterReplay = await readIssuedRows(harness.adminPool, first.valetSessionId);
      expect(afterReplay.intents).toHaveLength(1);
      expect(afterReplay.audit).toHaveLength(rows.audit.length);

      await createRevokeGuestAccessCommandExecutor(harness.runtimePool)({
        authenticatedUserId: fixture.userId, valetSessionId: first.valetSessionId,
      });
      expect(await execute(request)).toEqual(first);
      const revoked = await readIssuedRows(harness.adminPool, first.valetSessionId);
      expect(revoked.session?.customer_access_generation).toBe(2);
      expect(revoked.session?.customer_access_revoked_at).not.toBeNull();
      expect(revoked.intents).toHaveLength(1);
    });

    it("keeps disabled placeholders for No Phone and no independently verified opt-in", async () => {
      const fixture = await harness.createFixture();
      await configureVerifiedIssuance(harness.adminPool, fixture, null);
      const execute = issue();
      const noPhone = await execute(harness.temporaryRequest(fixture));
      const noPermission = await execute(harness.temporaryRequest(fixture, {
        customer: { intent: "DIFFERENT_CUSTOMER", phone: "+962790000001" },
      }));
      for (const session of [noPhone, noPermission]) {
        const rows = await readIssuedRows(harness.adminPool, session.valetSessionId);
        expect(rows.session?.customer_access_token_hash).toMatch(/^disabled:intake:/);
        expect(rows.intents).toHaveLength(0);
        expect(rows.deliveries).toHaveLength(0);
      }
    });

    it("uses saved canonical Customer for returning Intake without a second customer", async () => {
      const fixture = await harness.createFixture();
      await configureVerifiedIssuance(harness.adminPool, fixture, "+962790000002");
      const execute = issue();
      const first = await execute({
        ...harness.confirmedRequest(fixture),
        customer: { intent: "DIFFERENT_CUSTOMER", phone: "+962790000002" },
      });
      await harness.completeSession(fixture, first.valetSessionId);
      const returning = await execute({
        ...harness.confirmedRequest(fixture),
        customer: { intent: "USE_SAVED_CUSTOMER", customerId: first.customerId! },
      });
      expect(returning.customerId).toBe(first.customerId);
      expect((await readIssuedRows(harness.adminPool, returning.valetSessionId)).intents)
        .toHaveLength(1);
    });

    it("issues for an explicitly consented canonical non-Jordan returning Customer", async () => {
      const fixture = await harness.createFixture();
      await configureVerifiedIssuance(harness.adminPool, fixture, "+447911123456");
      const execute = issue();
      const first = await execute({
        ...harness.confirmedRequest(fixture),
        customer: { intent: "DIFFERENT_CUSTOMER", phone: "+962790000009" },
      });
      await harness.completeSession(fixture, first.valetSessionId);
      await harness.adminPool.query(
        `UPDATE customers SET phone_normalized = $3, updated_at = clock_timestamp()
         WHERE id = $1 AND organization_id = $2`,
        [first.customerId, fixture.organizationId, "+447911123456"],
      );
      const returning = await execute({
        ...harness.confirmedRequest(fixture),
        customer: { intent: "USE_SAVED_CUSTOMER", customerId: first.customerId! },
      });
      expect((await readIssuedRows(harness.adminPool, returning.valetSessionId)).intents)
        .toHaveLength(1);
    });
  },
);
