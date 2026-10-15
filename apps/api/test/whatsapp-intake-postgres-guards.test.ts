import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

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

    it("inherits a partial Location override and rejects old intent after company OFF then ON", async () => {
      const fixture = await harness.createFixture();
      await configureVerifiedIssuance(harness.adminPool, fixture, "+962790000008");
      const company = await harness.adminPool.query<{ id: string; revision: number }>(
        `SELECT id::text, revision FROM outbound_messaging_policies
         WHERE organization_id = $1 AND location_id IS NULL`,
        [fixture.organizationId],
      );
      await harness.adminPool.query(
        `INSERT INTO outbound_messaging_policies
           (organization_id, location_id, purpose, enabled, language)
         VALUES ($1, $2, 'INITIAL_GUEST_ACCESS', NULL, 'en')`,
        [fixture.organizationId, fixture.locationId],
      );
      const execute = issue();
      const issued = await execute({
        ...harness.confirmedRequest(fixture),
        customer: { intent: "DIFFERENT_CUSTOMER", phone: "+962790000008" },
      });
      const intents = await harness.adminPool.query<{
        id: string;
        provider_binding_id: string;
        policy_revision: number;
        company_policy_revision: number;
        language: string;
        recipient_digest: string;
        policy_id: string;
      }>(
        `SELECT id::text, policy_id::text, provider_binding_id::text,
                policy_revision, company_policy_revision, language, recipient_digest
         FROM outbound_message_intents WHERE valet_session_id = $1`,
        [issued.valetSessionId],
      );
      const intent = intents.rows[0]!;
      expect(intent.language).toBe("en");
      expect(intent.policy_id).not.toBe(company.rows[0]?.id);
      expect(intent.policy_revision).toBe(1);
      expect(intent.company_policy_revision).toBe(company.rows[0]?.revision);

      // Positive control: inherited NULLs must permit dispatch with no Meta I/O.
      await harness.adminPool.query(
        `INSERT INTO outbound_message_budgets
           (provider_binding_id, capacity, tokens, refill_per_second)
         VALUES ($1, 2, 2, 1)`, [intent.provider_binding_id],
      );
      await harness.adminPool.query(
        `UPDATE outbound_messaging_control SET send_enabled = TRUE,
         updated_at = clock_timestamp() WHERE environment = 'test'`,
      );
      const leaseCurrent = randomUUID();
      const currentDelivery = await harness.adminPool.query<{ id: string }>(
        `UPDATE outbound_message_deliveries d
         SET state = 'LEASED', lease_token = $2,
             lease_expires_at = clock_timestamp() + interval '30 seconds',
             updated_at = clock_timestamp()
         FROM outbound_message_intents i
         WHERE d.intent_id = i.id AND i.id = $1
         RETURNING d.id::text`, [intent.id, leaseCurrent],
      );
      const currentPermit = await harness.adminPool.query(
        "SELECT * FROM outbound_dispatch_permit($1::uuid, $2::uuid, $3::text)",
        [currentDelivery.rows[0]!.id, leaseCurrent, intent.recipient_digest],
      );
      expect(currentPermit.rows).toHaveLength(1);

      // Create a new queued intent under exactly the same effective policy.
      await harness.completeSession(fixture, issued.valetSessionId);
      const next = await execute({
        ...harness.confirmedRequest(fixture),
        customer: { intent: "USE_SAVED_CUSTOMER", customerId: issued.customerId! },
      });
      const nextIntents = await harness.adminPool.query<{
        id: string; recipient_digest: string; company_policy_revision: number;
      }>(
        `SELECT id::text, recipient_digest, company_policy_revision
         FROM outbound_message_intents WHERE valet_session_id = $1`,
        [next.valetSessionId],
      );
      const queued = nextIntents.rows[0]!;
      expect(queued.company_policy_revision).toBe(intent.company_policy_revision);

      // Re-enable is not permission to replay an intent snapshotted before revocation.
      await harness.adminPool.query(
        `UPDATE outbound_messaging_policies
         SET enabled = FALSE, revision = revision + 1, updated_at = clock_timestamp()
         WHERE id = $1`, [company.rows[0]!.id],
      );
      await harness.adminPool.query(
        `UPDATE outbound_messaging_policies
         SET enabled = TRUE, revision = revision + 1, updated_at = clock_timestamp()
         WHERE id = $1`, [company.rows[0]!.id],
      );
      const lease = randomUUID();
      const delivery = await harness.adminPool.query<{ id: string }>(
        `UPDATE outbound_message_deliveries d
         SET state = 'LEASED', lease_token = $2,
             lease_expires_at = clock_timestamp() + interval '30 seconds',
             updated_at = clock_timestamp()
         FROM outbound_message_intents i
         WHERE d.intent_id = i.id AND i.id = $1
         RETURNING d.id::text`, [queued.id, lease],
      );
      await expect(harness.adminPool.query(
        "SELECT * FROM outbound_dispatch_permit($1::uuid, $2::uuid, $3::text)",
        [delivery.rows[0]!.id, lease, queued.recipient_digest],
      )).rejects.toThrow(/OUTBOUND_INELIGIBLE/);
    });

    it("does not issue an intent for an unverified sender binding", async () => {
      const fixture = await harness.createFixture();
      await configureVerifiedIssuance(harness.adminPool, fixture, "+962790000007");
      await harness.adminPool.query(
        `UPDATE outbound_provider_bindings
         SET provider_verified_at = NULL, provider_evidence_reference = NULL,
             revision = revision + 1, updated_at = clock_timestamp()
         WHERE organization_id = $1`, [fixture.organizationId],
      );
      const result = await issue()(harness.temporaryRequest(fixture, {
        customer: { intent: "DIFFERENT_CUSTOMER", phone: "+962790000007" },
      }));
      const rows = await readIssuedRows(harness.adminPool, result.valetSessionId);
      expect(rows.intents).toHaveLength(0);
      expect(rows.session?.customer_access_token_hash).toMatch(/^disabled:intake:/);
    });

    it("rejects a company-only queued intent if a Location override is added afterwards", async () => {
      const fixture = await harness.createFixture();
      await configureVerifiedIssuance(harness.adminPool, fixture, "+962790000006");
      const result = await issue()(harness.temporaryRequest(fixture, {
        customer: { intent: "DIFFERENT_CUSTOMER", phone: "+962790000006" },
      }));
      const intentRows = await harness.adminPool.query<{
        id: string; provider_binding_id: string; recipient_digest: string;
      }>(
        `SELECT id::text, provider_binding_id::text, recipient_digest
         FROM outbound_message_intents WHERE valet_session_id = $1`,
        [result.valetSessionId],
      );
      const intent = intentRows.rows[0]!;

      // A new Location override is a new governing policy, even if the
      // original company default remains enabled and at the same revision.
      await harness.adminPool.query(
        `INSERT INTO outbound_messaging_policies
           (organization_id, location_id, purpose, enabled)
         VALUES ($1, $2, 'INITIAL_GUEST_ACCESS', FALSE)`,
        [fixture.organizationId, fixture.locationId],
      );
      await harness.adminPool.query(
        `INSERT INTO outbound_message_budgets
           (provider_binding_id, capacity, tokens, refill_per_second)
         VALUES ($1, 2, 2, 1)`,
        [intent.provider_binding_id],
      );
      await harness.adminPool.query(
        `UPDATE outbound_messaging_control SET send_enabled = TRUE,
         updated_at = clock_timestamp() WHERE environment = 'test'`,
      );
      const lease = randomUUID();
      const delivery = await harness.adminPool.query<{ id: string }>(
        `UPDATE outbound_message_deliveries d
         SET state = 'LEASED', lease_token = $2,
             lease_expires_at = clock_timestamp() + interval '30 seconds',
             updated_at = clock_timestamp()
         FROM outbound_message_intents i
         WHERE d.intent_id = i.id AND i.id = $1
         RETURNING d.id::text`, [intent.id, lease],
      );
      await expect(harness.adminPool.query(
        "SELECT * FROM outbound_dispatch_permit($1::uuid, $2::uuid, $3::text)",
        [delivery.rows[0]!.id, lease, intent.recipient_digest],
      )).rejects.toThrow(/OUTBOUND_INELIGIBLE/);
    });

    it("serializes concurrent same-operation retries to a single generation and intent", async () => {
      const fixture = await harness.createFixture();
      await configureVerifiedIssuance(harness.adminPool, fixture, "+962790000003");
      const operationId = `intake:${randomUUID()}`;
      const request = harness.temporaryRequest(fixture, {
        intakeOperationId: operationId,
        customer: { intent: "DIFFERENT_CUSTOMER", phone: "+962790000003" },
      });
      const execute = issue();
      const [first, second] = await Promise.all([execute(request), execute(request)]);
      expect(first).toEqual(second);
      const issued = await readIssuedRows(harness.adminPool, first.valetSessionId);
      expect(issued.intents).toHaveLength(1);
      expect(issued.audit.filter((row) => row.event_type === "GUEST_ACCESS_ISSUED"))
        .toHaveLength(1);
    });

    it("rolls back entire fresh Intake when eligible issuing fails", async () => {
      const fixture = await harness.createFixture();
      const before = await harness.readCounts(fixture.organizationId);
      const request = harness.temporaryRequest(fixture, {
        customer: { intent: "DIFFERENT_CUSTOMER", phone: "+962790000004" },
      });
      const execute = createIntakeSessionCommandExecutor(harness.runtimePool, {
        initialGuestIssuance: async () => { throw new Error("forced-outbox-failure"); },
      });
      await expect(execute(request)).rejects.toThrow("forced-outbox-failure");
      expect(await harness.readCounts(fixture.organizationId)).toEqual(before);
    });
  },
);
