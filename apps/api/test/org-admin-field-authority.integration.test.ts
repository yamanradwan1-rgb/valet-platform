import { randomBytes, randomUUID } from "node:crypto";

import { generate } from "otplib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { HttpResult } from "./phase3-operations-gate-test-context";
import {
  buildParkingSamples,
  getRawGpsSamples,
  getTrackers,
  queryDbNow,
  setTrackingPolicy,
} from "./phase5-tracking-gate-database";
import {
  num,
  Phase5TrackingGateContext,
  text,
} from "./phase5-tracking-gate-test-context";

const context = new Phase5TrackingGateContext("org_admin_field_authority");
const originalMfaEnvironment = {
  recovery: process.env.MFA_RECOVERY_HMAC_SECRET_B64URL,
  totp: process.env.MFA_TOTP_ENCRYPTION_KEY_B64URL,
};

function restoreMfaEnvironment(): void {
  for (const [name, value] of [
    ["MFA_RECOVERY_HMAC_SECRET_B64URL", originalMfaEnvironment.recovery],
    ["MFA_TOTP_ENCRYPTION_KEY_B64URL", originalMfaEnvironment.totp],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function expectDenied(result: HttpResult, code: string): void {
  expect(result).toMatchObject({ body: { code }, status: 404 });
}

async function assureCompanyAdmin(
  fixture: Awaited<ReturnType<typeof context.createGateFixture>>,
): Promise<string> {
  const admin = await context.addMember(fixture, "ORG_ADMIN", false);
  const token = await context.authorize(admin.userId);
  const begin = await context.staffPost(
    token,
    "/v1/staff/auth/mfa/enrollment/begin",
    {},
  );
  expect(begin.status).toBe(200);
  const factorId = text(begin.body, "factorId");
  const provisioning = begin.body.provisioning as { secretBase32?: unknown };
  const secret = String(provisioning.secretBase32);
  const now = await queryDbNow(context.adminPool);
  const step = Math.floor(now.getTime() / 1_000 / 30);
  const code = await generate({
    algorithm: "sha1",
    digits: 6,
    epoch: step * 30,
    period: 30,
    secret,
    strategy: "totp",
  });
  const confirmed = await context.staffPost(
    token,
    "/v1/staff/auth/mfa/enrollment/confirm",
    { code, factorId },
  );
  expect(confirmed.status).toBe(200);
  expect(
    (await context.staffGet(token, "/v1/staff/auth/mfa/state")).body,
  ).toMatchObject({ state: "ASSURED" });
  expect(
    (await context.staffGet(token, "/v1/staff/management/organizations?limit=25"))
      .status,
  ).toBe(200);
  return token;
}

beforeAll(async () => {
  process.env.MFA_RECOVERY_HMAC_SECRET_B64URL =
    randomBytes(32).toString("base64url");
  process.env.MFA_TOTP_ENCRYPTION_KEY_B64URL =
    randomBytes(32).toString("base64url");
  try {
    await context.setupGate();
  } catch (error) {
    restoreMfaEnvironment();
    throw error;
  }
}, 120_000);

afterAll(async () => {
  try {
    await context.teardownGate();
  } finally {
    restoreMfaEnvironment();
  }
}, 60_000);

describe("MGT-BE-03 ORG_ADMIN field-authority boundary", () => {
  it("keeps check-in, keys, Dispatch, Parking and GPS operational-only after MFA", async () => {
    const fixture = await context.createGateFixture();
    const adminToken = await assureCompanyAdmin(fixture);
    const path = `/v1/staff/valet-sessions/${fixture.sessionId}`;
    await setTrackingPolicy(
      context.adminPool,
      fixture.organizationId,
      fixture.locationId,
      false,
      true,
    );

    expectDenied(
      await context.staffPost(adminToken, "/v1/staff/check-in/intakes", {
        intakeOperationId: `intake:${randomUUID()}`,
        targetLocationId: fixture.locationId,
        vehicleIdentity: {
          mode: "TEMPORARY_DESCRIPTOR",
          temporaryDescriptor: `Admin attempt ${randomUUID()}`,
        },
      }),
      "AUTHORIZATION_DENIED",
    );
    expectDenied(
      await context.staffPost(adminToken, `${path}/key-slot/assign`, {
        expectedVersion: 1,
        keySlotCode: fixture.keySlotCode,
      }),
      "AUTHORIZATION_DENIED",
    );

    const key = await context.staffPost(
      fixture.accessToken,
      `${path}/key-slot/assign`,
      { expectedVersion: 1, keySlotCode: fixture.keySlotCode },
    );
    expect(key.status).toBe(200);
    expectDenied(
      await context.staffPost(adminToken, `${path}/parking-task/queue`, {}),
      "TASK_NOT_FOUND_OR_FORBIDDEN",
    );
    const queued = await context.staffPost(
      fixture.accessToken,
      `${path}/parking-task/queue`,
      {},
    );
    expect(queued.status).toBe(200);
    const taskId = text(queued.body, "taskId");
    expectDenied(
      await context.staffPost(adminToken, `/v1/staff/tasks/${taskId}/assign`, {
        expectedVersion: num(queued.body, "version"),
      }),
      "TASK_NOT_FOUND_OR_FORBIDDEN",
    );
    const assigned = await context.staffPost(
      fixture.accessToken,
      `/v1/staff/tasks/${taskId}/assign`,
      { expectedVersion: num(queued.body, "version") },
    );
    expect(assigned.status).toBe(200);
    expectDenied(
      await context.staffPost(adminToken, `/v1/staff/tasks/${taskId}/accept`, {
        expectedVersion: num(assigned.body, "version"),
      }),
      "TASK_NOT_FOUND_OR_FORBIDDEN",
    );
    const accepted = await context.staffPost(
      fixture.accessToken,
      `/v1/staff/tasks/${taskId}/accept`,
      { expectedVersion: num(assigned.body, "version") },
    );
    expect(accepted.status).toBe(200);

    const startBody = {
      expectedSessionVersion: num(key.body, "version"),
      expectedTaskVersion: num(accepted.body, "version"),
    };
    expectDenied(
      await context.staffPost(adminToken, `${path}/start-parking`, startBody),
      "TASK_NOT_FOUND_OR_FORBIDDEN",
    );
    const started = await context.staffPost(
      fixture.accessToken,
      `${path}/start-parking`,
      startBody,
    );
    expect(started.status).toBe(200);
    const tracker = (await getTrackers(context.adminPool, fixture.sessionId))[0]!;
    const sample = buildParkingSamples(await queryDbNow(context.adminPool))[0]!;
    expectDenied(
      await context.staffPost(adminToken, `${path}/tracking/gps-samples`, {
        samples: [sample],
      }),
      "TASK_NOT_FOUND_OR_FORBIDDEN",
    );
    expect(await getRawGpsSamples(context.adminPool, tracker.id)).toHaveLength(0);

    const confirmBody = {
      expectedSessionVersion: num(started.body, "sessionVersion"),
      expectedTaskVersion: num(started.body, "taskVersion"),
      keySlotCode: fixture.keySlotCode,
      parkingSpotCode: fixture.parkingSpotCode,
    };
    expectDenied(
      await context.staffPost(adminToken, `${path}/confirm-parked`, confirmBody),
      "TASK_NOT_FOUND_OR_FORBIDDEN",
    );
    expect(
      (
        await context.staffPost(
          fixture.accessToken,
          `${path}/confirm-parked`,
          confirmBody,
        )
      ).status,
    ).toBe(200);
  });

  it("keeps Retrieval, READY and handoff release operational-only after MFA", async () => {
    const parked = await context.createParkedFixture();
    const adminToken = await assureCompanyAdmin(parked);
    const requested = await context.requestRetrieval(parked);
    const owner = await context.assignAndAccept(requested);
    const path = `/v1/staff/valet-sessions/${owner.sessionId}`;
    const retrievalBody = {
      expectedSessionVersion: owner.sessionVersion,
      expectedTaskVersion: owner.taskVersion,
    };
    expectDenied(
      await context.staffPost(adminToken, `${path}/start-retrieval`, retrievalBody),
      "TASK_NOT_FOUND_OR_FORBIDDEN",
    );
    const started = await context.staffPost(
      owner.accessToken,
      `${path}/start-retrieval`,
      retrievalBody,
    );
    expect(started.status).toBe(200);

    const readyBody = {
      expectedSessionVersion: num(started.body, "sessionVersion"),
    };
    expectDenied(
      await context.staffPost(adminToken, `${path}/mark-ready`, readyBody),
      "TASK_NOT_FOUND_OR_FORBIDDEN",
    );
    const ready = await context.staffPost(owner.accessToken, `${path}/mark-ready`, readyBody);
    expect(ready.status).toBe(200);

    const initiateBody = {
      expectedSessionVersion: num(ready.body, "sessionVersion"),
    };
    expectDenied(
      await context.staffPost(adminToken, `${path}/initiate-handoff`, initiateBody),
      "TASK_NOT_FOUND_OR_FORBIDDEN",
    );
    const initiated = await context.staffPost(
      owner.accessToken,
      `${path}/initiate-handoff`,
      initiateBody,
    );
    expect(initiated.status).toBe(200);
    const pending = {
      ...owner,
      sessionVersion: num(initiated.body, "sessionVersion"),
      taskVersion: num(initiated.body, "taskVersion"),
    };
    const verified = await context.verifyStandard(pending, "PICKUP_CODE");
    expectDenied(
      await context.staffPost(adminToken, `${path}/complete-handoff`, {
        expectedSessionVersion: verified.sessionVersion,
      }),
      "TASK_NOT_FOUND_OR_FORBIDDEN",
    );
    expect((await context.complete(verified)).status).toBe(200);
  });
});
