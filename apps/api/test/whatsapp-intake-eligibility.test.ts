import { randomBytes, randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { PostgresTransaction } from "../src/common/database/postgres";
import { createRecipientDigestFactory } from "../src/modules/notifications/issuance/initial-guest-crypto";
import { createInitialGuestEligibilityResolver } from "../src/modules/notifications/issuance/initial-guest-eligibility";

const scope = {
  organizationId: randomUUID(),
  locationId: randomUUID(),
  sessionId: randomUUID(),
  customerId: randomUUID(),
  actorMembershipId: randomUUID(),
};
const digest = createRecipientDigestFactory(randomBytes(32).toString("base64"), "v1");

interface FixtureChange {
  phone?: string;
  grant?: boolean;
  grantAction?: "GRANT" | "WITHDRAW";
  grantedUntil?: Date;
  companyEnabled?: boolean;
  locationOverride?: boolean;
  bindingEnabled?: boolean;
  switchEnabled?: boolean;
}

function fixture(change: FixtureChange = {}) {
  const policyId = randomUUID();
  const bindingId = randomUUID();
  const permissionId = randomUUID();
  const locationPolicyId = randomUUID();
  const sql: { text: string; params: readonly unknown[] }[] = [];
  const query = async (text: string, params: readonly unknown[] = []) => {
    sql.push({ text, params });
    if (text.includes("FROM customers")) {
      return { rows: [{ phone_normalized: change.phone ?? "+962790000000" }] };
    }
    if (text.includes("FROM outbound_messaging_policies")) {
      const rows: {
        id: string;
        location_id: string | null;
        enabled: boolean;
        language: string;
        provider_binding_id: string;
        template_catalog_version: string;
        revision: number;
      }[] = [{
        id: policyId, location_id: null, enabled: change.companyEnabled ?? true,
        language: "ar", provider_binding_id: bindingId,
        template_catalog_version: "template-v1", revision: 3,
      }];
      if (change.locationOverride) rows.push({
        id: locationPolicyId, location_id: scope.locationId,
        enabled: false, language: "ar", provider_binding_id: bindingId,
        template_catalog_version: "template-v1", revision: 4,
      });
      return { rows };
    }
    if (text.includes("FROM outbound_messaging_permissions")) {
      return { rows: change.grant === false ? [] : [{
        id: permissionId, revision: 1, evidence_reference: "verified-consent-42",
        collected_at: new Date("2026-10-15T00:00:00.000Z"),
        expires_at: change.grantedUntil ?? new Date("2026-11-15T00:00:00.000Z"),
        withdrawn_at: null,
      }] };
    }
    if (text.includes("FROM outbound_permission_events")) {
      return { rows: [{ action: change.grantAction ?? "GRANT",
        evidence_reference: "verified-consent-42" }] };
    }
    if (text.includes("FROM outbound_provider_bindings")) {
      return { rows: [{ id: bindingId, enabled: change.bindingEnabled ?? true,
        revision: 2, environment: "test" }] };
    }
    if (text.includes("FROM outbound_messaging_control")) {
      return { rows: [{ issue_enabled: change.switchEnabled ?? true }] };
    }
    if (text.includes("clock_timestamp()")) {
      return { rows: [{ now: new Date("2026-10-15T20:00:00.000Z") }] };
    }
    throw new Error("Unexpected mocked SQL");
  };
  return { tx: { query } as unknown as PostgresTransaction, sql, policyId };
}

describe("initial WhatsApp issuance consent and policy gate", () => {
  it("uses locked canonical customer and current verified GRANT, never Native input", async () => {
    const db = fixture();
    const result = await createInitialGuestEligibilityResolver(digest, "test")(db.tx, scope);
    expect(result).toMatchObject({
      recipientDigest: digest("+962790000000"),
      policyId: db.policyId,
      permissionRevision: 1,
      bindingRevision: 2,
      locale: "ar",
    });
    expect(db.sql.every(({ text }) => text.includes("FOR SHARE") ||
      text.includes("clock_timestamp()"))).toBe(true);
    expect(db.sql[0]?.params).toEqual([scope.organizationId, scope.customerId]);
  });

  it.each([
    ["no consent", { grant: false }],
    ["withdrawal", { grantAction: "WITHDRAW" }],
    ["expired consent", { grantedUntil: new Date("2026-10-15T19:00:00.000Z") }],
    ["company OFF", { companyEnabled: false }],
    ["Location override OFF", { locationOverride: true }],
    ["binding OFF", { bindingEnabled: false }],
    ["durable kill switch OFF", { switchEnabled: false }],
    ["legacy invalid customer phone", { phone: "0790000000" }],
  ] satisfies [string, FixtureChange][])("skips %s without issuing", async (_name, change) => {
    const db = fixture(change);
    await expect(createInitialGuestEligibilityResolver(digest, "test")(
      db.tx, scope,
    )).resolves.toBeNull();
  });
});
