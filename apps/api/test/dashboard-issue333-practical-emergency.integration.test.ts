import { randomUUID } from "node:crypto";

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { DashboardScopeDiscoveryService } from "../src/modules/dashboard/dashboard-scope-discovery.service";
import {
  barrier,
  fixture,
  startIssue333Lab,
  stopIssue333Lab,
} from "./dashboard-issue333-lab";
import { controlledDisable } from "./issue333-u002-emergency-harness";
import { actor, persistentWitness } from "./issue333-u002-emergency-witness";

async function registerPush(subject: Awaited<ReturnType<typeof actor>>) {
  const response = await fixture.request("/v1/staff/push/registrations", {
    authorization: `Bearer ${subject.auth.accessToken}`,
    method: "PUT",
    body: {
      appBuild: "333",
      appIdentifier: "com.vaylet.employee",
      appVersion: "1.0.0",
      installationId: randomUUID(),
      locale: "en",
      platform: "ANDROID",
      provider: "FCM",
      providerToken: `issue333-practical-synthetic-${randomUUID()}`,
    },
  });
  expect(response.status).toBe(200);
  return String(response.body?.registrationId);
}

async function registration(id: string) {
  const result = await fixture.query<{
    state: string;
    provider_token: string | null;
    terminal_reason_class: string | null;
  }>(
    `SELECT state::text, provider_token, terminal_reason_class
     FROM staff_push_registrations WHERE id=$1`,
    [id],
  );
  expect(result.rowCount).toBe(1);
  return result.rows[0]!;
}

async function disable(userId: string, operationId: string) {
  const invoked = controlledDisable(
    userId,
    operationId,
    fixture.migrationDatabaseUrl(),
  );
  return invoked.result;
}

beforeAll(startIssue333Lab, 180_000);
afterAll(stopIssue333Lab, 90_000);
afterEach(() => vi.restoreAllMocks());

describe("Issue #333 practical global User emergency-disable gates", () => {
  it("denies new reads with 401, invalidates sessions/push and retries one audited write", async () => {
    const target = await actor(`ISSUE333-PRACTICAL-DISABLED-${randomUUID()}`);
    const unaffected = await actor(`ISSUE333-PRACTICAL-ACTIVE-${randomUUID()}`);
    const targetPush = await registerPush(target);
    const unaffectedPush = await registerPush(unaffected);
    expect(
      (await fixture.managementGet(target.path, target.auth.accessToken))
        .status,
    ).toBe(200);
    const operationId = randomUUID();
    await disable(target.user.id, operationId);
    const witness = await persistentWitness(
      target.user.id,
      target.auth.sessionId,
      operationId,
    );
    expect(witness.audits).toBe(1);
    const fresh = await fixture.managementGet(
      target.path,
      target.auth.accessToken,
    );
    expect(fresh.status).toBe(401);
    expect(JSON.stringify(fresh.body)).not.toContain(target.location.name);
    const refresh = await fixture.request("/v1/staff/auth/native/refresh", {
      body: { refreshToken: target.auth.refreshToken },
    });
    expect(refresh.status).toBe(401);
    expect(await registration(targetPush)).toMatchObject({
      provider_token: null,
      state: "DISABLED",
      terminal_reason_class: "USER_SECURITY_DISABLED",
    });
    expect((await registration(unaffectedPush)).state).toBe("ACTIVE");
    expect(
      (
        await fixture.managementGet(
          unaffected.path,
          unaffected.auth.accessToken,
        )
      ).status,
    ).toBe(200);
    // An ambiguous/lost CLI acknowledgement replays the same operation ID.
    await disable(target.user.id, operationId);
    const replay = await persistentWitness(
      target.user.id,
      target.auth.sessionId,
      operationId,
    );
    expect(replay.audits).toBe(1);
    expect((await registration(targetPush)).state).toBe("DISABLED");
  }, 60_000);

  it("accepts bounded pre-disable in-flight completion and refuses all fresh admissions", async () => {
    const target = await actor(`ISSUE333-PRACTICAL-INFLIGHT-${randomUUID()}`);
    const entered = barrier();
    const release = barrier();
    const original = DashboardScopeDiscoveryService.prototype.listLocations;
    let paused = false;
    vi.spyOn(
      DashboardScopeDiscoveryService.prototype,
      "listLocations",
    ).mockImplementation(async function (
      this: DashboardScopeDiscoveryService,
      ...args
    ) {
      const result = await original.apply(this, args);
      if (!paused && args[1] === target.membership.organizationId) {
        paused = true;
        entered.release();
        await release.promise;
      }
      return result;
    });
    const pending = fixture.managementGet(target.path, target.auth.accessToken);
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          entered.promise,
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("Pre-disable gate timeout")),
              8_000,
            );
          }),
        ]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
      const operationId = randomUUID();
      await disable(target.user.id, operationId);
      await persistentWitness(
        target.user.id,
        target.auth.sessionId,
        operationId,
      );
      release.release();
      const admitted = await pending;
      expect([200, 401]).toContain(admitted.status);
      if (admitted.status === 200) {
        expect(JSON.stringify(admitted.body)).toContain(target.location.name);
      }
      const newRequest = await fixture.managementGet(
        target.path,
        target.auth.accessToken,
      );
      expect(newRequest.status).toBe(401);
      expect(JSON.stringify(newRequest.body)).not.toContain(
        target.location.name,
      );
    } finally {
      release.release();
      await Promise.allSettled([pending]);
    }
  }, 60_000);
});
