import { createHash, randomBytes, randomUUID } from "node:crypto";

import { type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "../src/app.module";
import { hashGuestAccessToken } from "../src/modules/valet-sessions/guest-access-command";
import { expect } from "vitest";
import {
  ConfirmParkedTestContext,
  type ConfirmParkedFixture,
} from "./confirm-parked-test-context";

export interface GateFixture extends ConfirmParkedFixture {
  readonly accessToken: string;
  readonly guestToken: string;
  readonly shiftId: string;
}

export interface HttpResult {
  readonly body: Record<string, unknown>;
  readonly headers: Headers;
  readonly status: number;
}

function accessHash(token: string): string {
  return `staff-access-sha256:v1:${createHash("sha256").update(token).digest("hex")}`;
}

export function number(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  if (typeof value !== "number") throw new Error(`Expected number for ${key}`);
  return value;
}

export function text(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string") throw new Error(`Expected string for ${key}`);
  return value;
}

export function assertQueueMatchesQueuedTask(
  queueBody: Record<string, unknown>,
  queuedBody: Record<string, unknown>,
): void {
  expect(queueBody).toMatchObject({
    tasks: [
      {
        ...queuedBody,
        parkingSpot: null,
        parkingZone: null,
        retrievalRequestedAt: null,
        vehicle: {
          color: null,
          make: null,
          model: null,
          plateNumberRaw: null,
          temporaryDescriptor: expect.stringMatching(/^Dispatch /),
        },
      },
    ],
  });
}

export class Phase3OperationsGateContext extends ConfirmParkedTestContext {
  private app?: INestApplication;
  private baseUrl = "";
  private priorDatabaseUrl: string | undefined;
  private priorAntiAbuseSecret: string | undefined;

  constructor(label: string) {
    super(`005h_${label}`);
  }

  async setupGate(): Promise<void> {
    await this.setup();
    this.priorDatabaseUrl = process.env.DATABASE_URL;
    this.priorAntiAbuseSecret = process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
    process.env.DATABASE_URL = this.runtimeUrl;
    process.env.ANTI_ABUSE_HMAC_SECRET_B64URL =
      randomBytes(32).toString("base64url");
    this.app = await NestFactory.create(AppModule, { logger: false });
    await this.app.listen(0, "127.0.0.1");
    const address = this.app.getHttpServer().address() as { port: number };
    this.baseUrl = `http://127.0.0.1:${address.port}`;
  }

  async teardownGate(): Promise<void> {
    await this.app?.close();
    if (this.priorDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = this.priorDatabaseUrl;
    if (this.priorAntiAbuseSecret === undefined) {
      delete process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
    } else {
      process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = this.priorAntiAbuseSecret;
    }
    await this.teardown();
  }

  async authorize(userId: string): Promise<string> {
    const token = `vsa1.${randomBytes(32).toString("base64url")}`;
    await this.adminPool.query(
      `INSERT INTO staff_auth_sessions
         (id, user_id, current_access_token_hash, access_expires_at,
          absolute_expires_at, created_at, last_rotated_at)
       VALUES ($1, $2, $3, clock_timestamp() + interval '15 minutes',
               clock_timestamp() + interval '1 hour', clock_timestamp(),
               clock_timestamp())`,
      [randomUUID(), userId, accessHash(token)],
    );
    return token;
  }

  async authorizeWrongLocation(fixture: GateFixture): Promise<string> {
    const locationId = randomUUID();
    const membershipId = randomUUID();
    const userId = randomUUID();
    await this.adminPool.query(
      `INSERT INTO locations
         (id, organization_id, name, code, address_text, timezone, currency,
          status, updated_at)
       VALUES ($1, $2, 'Gate other location', $3, 'Address', 'Asia/Amman',
               'JOD', 'ACTIVE', clock_timestamp())`,
      [locationId, fixture.organizationId, randomUUID()],
    );
    await this.adminPool.query(
      `INSERT INTO users (id, email, password_hash, status, updated_at)
       VALUES ($1, $2, 'not-real', 'ACTIVE', clock_timestamp())`,
      [userId, `${randomUUID()}@val-005h.test`],
    );
    await this.adminPool.query(
      `INSERT INTO organization_memberships
         (id, organization_id, user_id, role, status, updated_at)
       VALUES ($1, $2, $3, 'VALET_EMPLOYEE', 'ACTIVE', clock_timestamp())`,
      [membershipId, fixture.organizationId, userId],
    );
    await this.adminPool.query(
      `INSERT INTO membership_location_access
         (organization_id, membership_id, location_id)
       VALUES ($1, $2, $3)`,
      [fixture.organizationId, membershipId, locationId],
    );
    await this.adminPool.query(
      `INSERT INTO shifts
         (id, organization_id, location_id, membership_id, status, started_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', clock_timestamp())`,
      [randomUUID(), fixture.organizationId, locationId, membershipId],
    );
    return this.authorize(userId);
  }

  async createGateFixture(): Promise<GateFixture> {
    const base = await this.createDispatchFixture();
    const slot = await this.addKeySlot(base);
    const resource = await this.addParkingResource({
      ...base,
      keySlotCode: slot.code,
      keySlotId: slot.id,
      taskId: randomUUID(),
    });
    const shift = await this.adminPool.query<{ id: string }>(
      `SELECT id::text FROM shifts
       WHERE membership_id = $1 AND location_id = $2 AND status = 'ACTIVE'`,
      [base.membershipId, base.locationId],
    );
    const guestToken = randomBytes(32).toString("base64url");
    await this.adminPool.query(
      `UPDATE valet_sessions
       SET customer_access_token_hash = $2,
           customer_access_expires_at = clock_timestamp() + interval '1 hour',
           customer_access_revoked_at = NULL
       WHERE id = $1`,
      [base.sessionId, hashGuestAccessToken(guestToken)],
    );
    return {
      ...base,
      accessToken: await this.authorize(base.userId),
      guestToken,
      keySlotCode: slot.code,
      keySlotId: slot.id,
      parkingSpotCode: resource.spot.code,
      parkingSpotId: resource.spot.id,
      parkingZoneId: resource.zone.id,
      shiftId: shift.rows[0]!.id,
      taskId: "",
    };
  }

  async request(
    method: "GET" | "POST",
    path: string,
    options: {
      readonly body?: unknown;
      readonly origin?: string;
      readonly token?: string;
    } = {},
  ): Promise<HttpResult> {
    const headers: Record<string, string> = {};
    if (options.token !== undefined) {
      headers.authorization = `Bearer ${options.token}`;
    }
    if (options.origin !== undefined) {
      headers.origin = options.origin;
    }
    if (options.body !== undefined)
      headers["content-type"] = "application/json";
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    });
    const text = await response.text();
    return {
      body: text === "" ? {} : (JSON.parse(text) as Record<string, unknown>),
      headers: response.headers,
      status: response.status,
    };
  }

  async finalProjection(sessionId: string, taskId: string) {
    const result = await this.adminPool.query<Record<string, unknown>>(
      `SELECT session.state::text AS session_state,
              session.version AS session_version, session.parking_started_at,
              session.parked_at, session.key_slot_id::text,
              session.parking_zone_id::text, session.parking_spot_id::text,
              session.current_assignee_membership_id::text AS legacy_assignee,
              task.task_type::text, task.status::text AS task_status,
              task.version AS task_version,
              task.current_assignee_membership_id::text AS task_assignee
       FROM valet_sessions AS session
       INNER JOIN tasks AS task ON task.valet_session_id = session.id
       WHERE session.id = $1 AND task.id = $2`,
      [sessionId, taskId],
    );
    return result.rows[0]!;
  }

  async eventTypes(
    table: "dispatch_events" | "key_custody_events",
    id: string,
  ) {
    const ownerColumn =
      table === "dispatch_events" ? "task_id" : "valet_session_id";
    const result = await this.adminPool.query<{ event_type: string }>(
      `SELECT event_type::text FROM ${table}
       WHERE ${ownerColumn} = $1 ORDER BY occurred_at, created_at, id`,
      [id],
    );
    return result.rows.map((row) => row.event_type);
  }

  async auditEvents(sessionId: string, taskId: string) {
    const result = await this.adminPool.query<{
      actor_membership_id: string | null;
      event_type: string;
      location_id: string;
      metadata_json: Record<string, unknown>;
      organization_id: string;
    }>(
      `SELECT actor_membership_id::text, event_type, location_id::text,
              organization_id::text, metadata_json
       FROM audit_events
       WHERE valet_session_id = $1 OR (entity_type = 'Task' AND entity_id = $2)
       ORDER BY occurred_at, created_at, id`,
      [sessionId, taskId],
    );
    return result.rows;
  }
}
