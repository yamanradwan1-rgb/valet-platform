import { randomBytes } from "node:crypto";

import { expect } from "vitest";
import argon2 from "argon2";

import type { HttpResult } from "./phase3-operations-gate-test-context";
import { Phase4RetrievalHandoffGateContext } from "./phase4-retrieval-handoff-gate-test-context";

export function num(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  if (typeof value !== "number") throw new Error(`Missing number ${key}`);
  return value;
}

export function text(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string") throw new Error(`Missing string ${key}`);
  return value;
}

export class Phase5TrackingGateContext extends Phase4RetrievalHandoffGateContext {
  private priorStaffAllowedOrigins: string | undefined;
  private priorProviderSecret: string | undefined;
  private readonly fixturePassword = "Phase5StaffPassword!2026";
  private fixturePasswordHash = "";
  readonly configuredOrigin = "https://staff.valet.test";
  readonly providerSecretSentinel = `provider-secret-${randomBytes(16).toString("hex")}`;

  constructor(label: string) {
    super(`007h_${label}`);
  }

  override async setupGate(): Promise<void> {
    this.priorStaffAllowedOrigins = process.env.STAFF_AUTH_ALLOWED_ORIGINS;
    this.priorProviderSecret = process.env.PROVIDER_SECRET_SENTINEL;

    process.env.STAFF_AUTH_ALLOWED_ORIGINS = this.configuredOrigin;
    process.env.PROVIDER_SECRET_SENTINEL = this.providerSecretSentinel;

    this.fixturePasswordHash = await argon2.hash(this.fixturePassword, {
      hashLength: 32,
      memoryCost: 65_536,
      parallelism: 4,
      salt: randomBytes(16),
      timeCost: 3,
      type: argon2.argon2id,
      version: 19,
    });

    await super.setupGate();
  }

  override async teardownGate(): Promise<void> {
    try {
      await super.teardownGate();
    } finally {
      if (this.priorStaffAllowedOrigins !== undefined) {
        process.env.STAFF_AUTH_ALLOWED_ORIGINS = this.priorStaffAllowedOrigins;
      }
      if (this.priorProviderSecret !== undefined) {
        process.env.PROVIDER_SECRET_SENTINEL = this.priorProviderSecret;
      }
    }
  }

  override async authorize(userId: string): Promise<string> {
    const userResult = await this.adminPool.query<{ email: string }>(
      `SELECT email FROM users WHERE id = $1`,
      [userId],
    );
    const email = userResult.rows[0]?.email;
    if (email === undefined) {
      throw new Error(`Fixture user ${userId} not found.`);
    }

    await this.adminPool.query(
      `UPDATE users
       SET password_hash = $2, updated_at = clock_timestamp()
       WHERE id = $1`,
      [userId, this.fixturePasswordHash],
    );

    const login = await this.request("POST", "/v1/staff/auth/login", {
      body: {
        email,
        password: this.fixturePassword,
      },
      origin: this.configuredOrigin,
    });

    if (login.status !== 200) {
      throw new Error(
        `Production login failed for ${email}: status ${login.status} body ${JSON.stringify(login.body)}`,
      );
    }

    const accessToken = login.body.accessToken;
    if (typeof accessToken !== "string" || !accessToken.startsWith("vsa1.")) {
      throw new Error("Production login did not return a valid vsa1.* bearer.");
    }

    return accessToken;
  }

  staffGet(token: string, path: string): Promise<HttpResult> {
    return this.request("GET", path, { token });
  }

  async queueAssignAcceptParking(fixture: {
    readonly accessToken: string;
    readonly keySlotCode: string;
    readonly sessionId: string;
  }): Promise<{
    readonly keyAssignedSessionVersion: number;
    readonly taskId: string;
    readonly taskVersion: number;
  }> {
    const sessionPath = `/v1/staff/valet-sessions/${fixture.sessionId}`;
    const key = await this.staffPost(
      fixture.accessToken,
      `${sessionPath}/key-slot/assign`,
      { expectedVersion: 1, keySlotCode: fixture.keySlotCode },
    );
    const queued = await this.staffPost(
      fixture.accessToken,
      `${sessionPath}/parking-task/queue`,
      {},
    );
    const taskId = queued.body.taskId as string;
    const assigned = await this.staffPost(
      fixture.accessToken,
      `/v1/staff/tasks/${taskId}/assign`,
      { expectedVersion: queued.body.version as number },
    );
    const accepted = await this.staffPost(
      fixture.accessToken,
      `/v1/staff/tasks/${taskId}/accept`,
      { expectedVersion: assigned.body.version as number },
    );
    return {
      keyAssignedSessionVersion: key.body.version as number,
      taskId,
      taskVersion: accepted.body.version as number,
    };
  }

  startParking(
    fixture: { readonly accessToken: string; readonly sessionId: string },
    flow: {
      readonly keyAssignedSessionVersion: number;
      readonly taskVersion: number;
    },
  ): Promise<HttpResult> {
    return this.staffPost(
      fixture.accessToken,
      `/v1/staff/valet-sessions/${fixture.sessionId}/start-parking`,
      {
        expectedSessionVersion: flow.keyAssignedSessionVersion,
        expectedTaskVersion: flow.taskVersion,
      },
    );
  }

  confirmParked(
    fixture: {
      readonly accessToken: string;
      readonly parkingSpotCode: string;
      readonly sessionId: string;
    },
    started: HttpResult,
  ): Promise<HttpResult> {
    return this.staffPost(
      fixture.accessToken,
      `/v1/staff/valet-sessions/${fixture.sessionId}/confirm-parked`,
      {
        expectedSessionVersion: num(started.body, "sessionVersion"),
        expectedTaskVersion: num(started.body, "taskVersion"),
        parkingSpotCode: fixture.parkingSpotCode,
      },
    );
  }

  async expectActiveLiveMap(
    token: string,
    locationId: string,
    expectedItem: {
      readonly latitude: number;
      readonly longitude: number;
      readonly sessionId: string;
      readonly taskId: string;
      readonly taskType: "PARKING" | "RETRIEVAL";
      readonly trackingSessionId: string;
    },
  ): Promise<void> {
    const res = await this.staffGet(
      token,
      `/v1/staff/locations/${locationId}/live-operations-map`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      items: [
        {
          position: {
            areas: [],
            freshness: "LIVE",
            latitude: expectedItem.latitude,
            longitude: expectedItem.longitude,
          },
          sessionState: expectedItem.taskType,
          taskId: expectedItem.taskId,
          taskType: expectedItem.taskType,
          trackingSessionId: expectedItem.trackingSessionId,
          valetSessionId: expectedItem.sessionId,
        },
      ],
    });
    expect(JSON.stringify(res.body)).not.toMatch(
      /clientSampleId|receivedAt|accuracy|raw_gps|polygon|guestToken|provider/i,
    );
  }

  async expectEndedRouteHistory(
    token: string,
    trackingSessionId: string,
    expectedSamples: readonly {
      readonly latitude: number;
      readonly longitude: number;
    }[],
  ): Promise<void> {
    const res = await this.staffGet(
      token,
      `/v1/staff/tracking-sessions/${trackingSessionId}/route-history`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      nextCursor: null,
      samples: expectedSamples.map((s) => ({
        latitude: s.latitude,
        longitude: s.longitude,
      })),
    });
    expect(JSON.stringify(res.body)).not.toMatch(
      /clientSampleId|receivedAt|accuracy|raw_gps|organizationId|locationId/i,
    );
  }
}
