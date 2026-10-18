import { describe, expect, it } from "vitest";
import {
  auditInvestigationCoverageSchema,
  auditInvestigationCurrentLabelSchema,
  auditInvestigationCursorPayloadSchema,
  auditInvestigationReadScopeSchema,
  auditInvestigationSafePersonSchema,
  auditInvestigationUtcSchema,
} from "./audit-investigation-common.js";

const id = "018f1234-5678-4abc-9234-56789abcdef0";
const when = "2026-10-23T11:00:00.000Z";

describe("investigation common safe boundaries", () => {
  it("rejects offset times, rollover dates, excessive precision and local time", () => {
    expect(auditInvestigationUtcSchema.safeParse(when).success).toBe(true);
    for (const value of [
      "2026-02-30T11:00:00Z",
      "2026-10-23T11:00:00+03:00",
      "2026-10-23T11:00:00.123456Z",
      "2026-10-23T11:00:00",
    ]) {
      expect(auditInvestigationUtcSchema.safeParse(value).success).toBe(false);
    }
  });

  it("accepts safe current labels, rejects contradictory unavailable data and emails", () => {
    expect(
      auditInvestigationCurrentLabelSchema.parse({
        value: null,
        basis: "CURRENT",
        unavailable: true,
      }).unavailable,
    ).toBe(true);
    expect(
      auditInvestigationCurrentLabelSchema.safeParse({
        value: "Toyota",
        basis: "CURRENT",
        unavailable: true,
      }).success,
    ).toBe(false);
    expect(
      auditInvestigationSafePersonSchema.safeParse({
        membershipId: id,
        currentDisplayName: "Maya Saeed",
        email: "private@test.invalid",
      }).success,
    ).toBe(false);
  });

  it("fails closed for mixed source coverage and client-injected authority", () => {
    const coverage = Object.fromEntries(
      ["AUDIT", "KEY_CUSTODY", "DISPATCH", "INCIDENT"].map((key) => [
        key,
        { status: "AVAILABLE" },
      ]),
    );
    expect(auditInvestigationCoverageSchema.safeParse(coverage).success).toBe(
      true,
    );
    expect(
      auditInvestigationCoverageSchema.safeParse({
        ...coverage,
        INCIDENT: { status: "AVAILABLE", rawMetadata: {} },
      }).success,
    ).toBe(false);
    expect(
      auditInvestigationReadScopeSchema.safeParse({
        organizationId: id,
        locationId: id,
        membershipId: id,
        role: "VALET_SUPERVISOR",
      }).success,
    ).toBe(false);
  });

  it("defines server-only HMAC cursor purpose/session/scope/filter binding", () => {
    const payload = {
      version: 1,
      purpose: "SEARCH_SESSIONS",
      organizationId: id,
      locationId: id,
      viewerSessionDigest: "a".repeat(64),
      filterDigest: "b".repeat(64),
      snapshotAt: when,
      snapshotCutoff: "2026-10-23T11:00:00.000000Z",
      databaseSnapshot: "101:104:102",
      issuedAt: when,
      expiresAt: "2026-10-23T11:15:00.000Z",
      last: { lastMatchedAt: "2026-10-23T11:00:00.000500Z", sessionId: id },
    };
    expect(
      auditInvestigationCursorPayloadSchema.safeParse(payload).success,
    ).toBe(true);
    expect(
      auditInvestigationCursorPayloadSchema.safeParse({
        ...payload,
        last: { ...payload.last, lastMatchedAt: when },
      }).success,
    ).toBe(false);
    expect(
      auditInvestigationCursorPayloadSchema.safeParse({
        ...payload,
        snapshotCutoff: when,
      }).success,
    ).toBe(false);
    expect(
      auditInvestigationCursorPayloadSchema.safeParse({
        ...payload,
        purpose: "SESSION_TIMELINE",
      }).success,
    ).toBe(false);
    expect(
      auditInvestigationCursorPayloadSchema.safeParse({
        ...payload,
        rawPlate: "SECRET",
      }).success,
    ).toBe(false);
    expect(
      auditInvestigationCursorPayloadSchema.safeParse({
        ...payload,
        expiresAt: "2026-10-23T11:16:00.000Z",
      }).success,
    ).toBe(false);
  });
});
