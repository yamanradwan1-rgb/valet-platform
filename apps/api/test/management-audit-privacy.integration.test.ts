import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementAuditTestFixture } from "./management-audit-test-fixture";

const fixture = new ManagementAuditTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

async function assuredAdmin() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id);
  const location = await fixture.addLocation(membership.organizationId);
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { auth, location, membership, user };
}

function organizationPath(organizationId: string): string {
  return `/v1/staff/management/organizations/${organizationId}/audit-events?limit=100`;
}

function itemById(body: unknown, eventId: string): Record<string, unknown> {
  const items = (body as { items?: Array<Record<string, unknown>> } | undefined)
    ?.items;
  const item = (items ?? []).find((candidate) => candidate.eventId === eventId);
  if (item === undefined) throw new Error(`Missing audit item ${eventId}.`);
  return item;
}

describe("MGT-BE-06 audit privacy projection", () => {
  it("returns only allowlisted primitives and drops raw secret-bearing metadata", async () => {
    const state = await assuredAdmin();
    const entityId = randomUUID();
    const occurredAt = new Date("2026-09-09T12:00:00.000Z");
    const secrets = {
      authorization: "Bearer secret-authorization-value",
      controlledOperatorRef: "operator-private-reference",
      dynamicQrPayload: "qr-private-payload",
      guestAccessToken: "guest-private-token",
      mfaSecret: "mfa-private-secret",
      phone: "+962799999999",
      pickupCode: "814205",
      plateNumber: "PRIVATE-PLATE-777",
      providerJson: "provider-private-json",
      providerToken: "provider-private-token",
      pushToken: "push-private-token",
      requestBody: "private-request-body",
      storageObjectKey: "private/storage/object/key",
    };
    const eventId = await fixture.insertAuditEvent({
      actorType: "CONTROLLED_OPERATOR",
      controlledOperatorRef: secrets.controlledOperatorRef,
      entityId,
      entityType: "ValetSession",
      eventType: "VALET_SESSION_CREATED",
      locationId: state.location.locationId,
      metadata: {
        ...secrets,
        customerPresent: true,
        identityMode: "CONFIRMED_PLATE",
        latitude: 32.555,
        longitude: 35.777,
        metadataJson: { raw: "metadata-private-value" },
        rawGps: { latitude: 32.555, longitude: 35.777 },
        routeHistory: [[32.5, 35.7]],
      },
      occurredAt,
      organizationId: state.membership.organizationId,
    });

    const result = await fixture.managementGet(
      organizationPath(state.membership.organizationId),
      state.auth.accessToken,
    );
    expect(result.status).toBe(200);
    const item = itemById(result.body, eventId);
    expect(item).toEqual({
      actor: { type: "CONTROLLED_OPERATOR" },
      details: {
        customerPresent: true,
        identityMode: "CONFIRMED_PLATE",
        kind: "CHECK_IN",
      },
      entity: { id: entityId, type: "VALET_SESSION" },
      eventId,
      eventType: "VALET_SESSION_CREATED",
      occurredAt: occurredAt.toISOString(),
      scope: {
        kind: "LOCATION",
        locationId: state.location.locationId,
      },
    });

    const serialized = JSON.stringify(item);
    for (const secret of Object.values(secrets)) {
      expect(serialized).not.toContain(secret);
    }
    for (const forbidden of [
      "metadataJson",
      "guestAccessToken",
      "pickupCode",
      "dynamicQrPayload",
      "mfaSecret",
      "phone",
      "plateNumber",
      "latitude",
      "longitude",
      "rawGps",
      "routeHistory",
      "providerToken",
      "pushToken",
      "storageObjectKey",
      "controlledOperatorRef",
      "requestBody",
      "providerJson",
      "authorization",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("falls back safely when a known event has malformed metadata", async () => {
    const state = await assuredAdmin();
    const entityId = randomUUID();
    const eventId = await fixture.insertAuditEvent({
      actorMembershipId: state.membership.membershipId,
      entityId,
      entityType: "Task",
      eventType: "TASK_ASSIGNED",
      locationId: state.location.locationId,
      metadata: {
        fromStatus: "NOT_A_STATUS",
        fromVersion: -1,
        reason: "must remain private",
        toStatus: { private: true },
        toVersion: "2",
      },
      occurredAt: new Date("2026-09-09T13:00:00.000Z"),
      organizationId: state.membership.organizationId,
    });

    const result = await fixture.managementGet(
      organizationPath(state.membership.organizationId),
      state.auth.accessToken,
    );
    expect(result.status).toBe(200);
    const item = itemById(result.body, eventId);
    expect(item).toMatchObject({
      details: { kind: "TASK" },
      entity: { id: entityId, type: "TASK" },
      eventType: "TASK_ASSIGNED",
    });
    expect(item.details).toEqual({ kind: "TASK" });
    expect(JSON.stringify(item)).not.toContain("must remain private");
  });

  it("omits unsafe optional integers without failing the audit page", async () => {
    const state = await assuredAdmin();
    const taskId = await fixture.insertAuditEvent({
      actorMembershipId: state.membership.membershipId,
      entityId: randomUUID(),
      entityType: "Task",
      eventType: "TASK_ASSIGNED",
      locationId: state.location.locationId,
      metadata: {
        fromStatus: "QUEUED",
        fromVersion: 1e100,
        toStatus: "ASSIGNED",
        toVersion: Number.MAX_SAFE_INTEGER,
      },
      organizationId: state.membership.organizationId,
    });
    const sessionId = await fixture.insertAuditEvent({
      actorMembershipId: state.membership.membershipId,
      entityId: randomUUID(),
      entityType: "ValetSession",
      eventType: "VALET_SESSION_HANDOFF_INITIATED",
      locationId: state.location.locationId,
      metadata: {
        attempt: 1.5,
        from_version: Number.MAX_SAFE_INTEGER + 1,
        max_attempts: Number.MAX_SAFE_INTEGER,
        method: "DYNAMIC_QR",
        to_version: -1,
      },
      organizationId: state.membership.organizationId,
    });

    const result = await fixture.managementGet(
      organizationPath(state.membership.organizationId),
      state.auth.accessToken,
    );
    expect(result.status).toBe(200);
    expect(itemById(result.body, taskId).details).toEqual({
      fromStatus: "QUEUED",
      kind: "TASK",
      toStatus: "ASSIGNED",
      toVersion: Number.MAX_SAFE_INTEGER,
    });
    expect(itemById(result.body, sessionId).details).toEqual({
      handoffMethod: "DYNAMIC_QR",
      kind: "SESSION",
      maxAttempts: Number.MAX_SAFE_INTEGER,
    });
    const serialized = JSON.stringify(result.body);
    expect(serialized).not.toContain("1e+100");
    expect(serialized).not.toContain(String(Number.MAX_SAFE_INTEGER + 1));
  });

  it("projects unknown tenant events to minimal UNKNOWN without leaking raw type or metadata", async () => {
    const state = await assuredAdmin();
    const occurredAt = new Date("2026-09-09T14:00:00.000Z");
    const rawType = "FUTURE_PRIVATE_AUDIT_EVENT";
    const secret = "unknown-private-payload";
    const eventId = await fixture.insertAuditEvent({
      actorType: "SYSTEM",
      entityId: randomUUID(),
      entityType: "Payment",
      eventType: rawType,
      locationId: state.location.locationId,
      metadata: { providerJson: secret },
      occurredAt,
      organizationId: state.membership.organizationId,
    });

    const result = await fixture.managementGet(
      organizationPath(state.membership.organizationId),
      state.auth.accessToken,
    );
    expect(result.status).toBe(200);
    const item = itemById(result.body, eventId);
    expect(item).toEqual({
      details: { kind: "UNKNOWN" },
      entity: null,
      eventId,
      eventType: "UNKNOWN",
      occurredAt: occurredAt.toISOString(),
      scope: {
        kind: "LOCATION",
        locationId: state.location.locationId,
      },
    });
    expect(JSON.stringify(item)).not.toContain(rawType);
    expect(JSON.stringify(item)).not.toContain(secret);
  });

  it("never mixes account-security audit into the tenant Management log", async () => {
    const state = await assuredAdmin();
    const tenantEventId = await fixture.insertAuditEvent({
      eventType: "VALET_SESSION_CREATED",
      locationId: state.location.locationId,
      metadata: {},
      organizationId: state.membership.organizationId,
    });
    const securityEventId = await fixture.insertAccountSecurityEvent({
      actorUserId: state.user.id,
      eventType: "MFA_RECOVERY_CODE_USED",
      subjectUserId: state.user.id,
    });

    const result = await fixture.managementGet(
      organizationPath(state.membership.organizationId),
      state.auth.accessToken,
    );
    expect(result.status).toBe(200);
    const ids = (result.body?.items as Array<{ eventId: string }>).map(
      (item) => item.eventId,
    );
    expect(ids).toContain(tenantEventId);
    expect(ids).not.toContain(securityEventId);
  });
});
