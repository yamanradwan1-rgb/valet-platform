import { randomUUID } from "node:crypto";

import {
  MiddlewareConsumer,
  Module,
  type INestApplication,
  type NestModule,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { RUNTIME_POSTGRES_POOL } from "../src/common/database/runtime-database.module";
import { RequestIdMiddleware } from "../src/common/http/api-request";
import { HttpInfrastructureModule } from "../src/common/http/http-infrastructure.module";
import {
  FailClosedStaffPrincipalResolver,
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../src/modules/auth/staff-principal";
import { StaffValetSessionController } from "../src/modules/staff/staff-valet-session.controller";
import { StaffValetSessionService } from "../src/modules/staff/staff-valet-session.service";
import {
  addMemberHelper,
  createKeySlotHelper,
  createParkingSpotHelper,
  createParkingZoneHelper,
  createVehicleHelper,
  type SessionFixtureOptions,
} from "./staff-valet-session-fixture-helpers";
import {
  ShiftTestContext,
  type ShiftFixture,
  type ShiftFixtureOptions,
  type TestRole,
} from "./shift-test-context";

export interface StaffValetSessionHarness {
  readonly baseUrl: () => string;
  readonly context: ShiftTestContext;
  readonly principals: Map<string, string>;
  addMember(
    fixture: ShiftFixture,
    role?: TestRole,
    startShift?: boolean,
  ): Promise<{ membershipId: string; userId: string }>;
  close(): Promise<void>;
  createKeySlot(
    fixture: ShiftFixture,
    code?: string,
    status?: "ACTIVE" | "INACTIVE",
    locationIdOverride?: string,
  ): Promise<string>;
  createParkingSpot(
    fixture: ShiftFixture,
    zoneId: string,
    code?: string,
    locationIdOverride?: string,
  ): Promise<string>;
  createParkingZone(
    fixture: ShiftFixture,
    code?: string,
    locationIdOverride?: string,
  ): Promise<string>;
  createSession(
    fixture: ShiftFixture,
    options?: SessionFixtureOptions,
  ): Promise<{ sessionId: string; vehicleId: string }>;
  createTask(
    fixture: ShiftFixture,
    sessionId: string,
    options?: {
      assigneeMembershipId?: string | null;
      status?: string;
      taskType?: "PARKING" | "RETRIEVAL";
    },
  ): Promise<string>;
  createVehicle(
    fixture: ShiftFixture,
    options?: {
      color?: string | null;
      make?: string | null;
      model?: string | null;
      plateCountry?: string | null;
      plateNumberNormalized?: string | null;
      plateNumberRaw?: string | null;
      temporaryDescriptor?: string | null;
    },
  ): Promise<string>;
  fixtureWithToken(options?: ShiftFixtureOptions): Promise<{
    fixture: ShiftFixture;
    token: string;
  }>;
  request<T = Record<string, unknown>>(
    method: string,
    path: string,
    options?: { readonly body?: unknown; readonly token?: string },
  ): Promise<{ body: T; status: number }>;
  start(): Promise<void>;
}

export function createStaffValetSessionHarness(): StaffValetSessionHarness {
  const context = new ShiftTestContext("valet_sess_det");
  const principals = new Map<string, string>();
  const principalResolver: StaffPrincipalResolver = {
    async resolve(authorization) {
      const userId =
        authorization === undefined ? undefined : principals.get(authorization);
      return userId === undefined
        ? new FailClosedStaffPrincipalResolver().resolve(authorization)
        : { userId };
    },
  };

  @Module({
    controllers: [StaffValetSessionController],
    imports: [HttpInfrastructureModule],
    providers: [
      StaffValetSessionService,
      {
        provide: RUNTIME_POSTGRES_POOL,
        useFactory: () => context.runtimePool,
      },
      {
        provide: STAFF_PRINCIPAL_RESOLVER,
        useValue: principalResolver,
      },
    ],
  })
  class TestStaffSessionModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
      consumer
        .apply(RequestIdMiddleware)
        .forRoutes(StaffValetSessionController);
    }
  }

  let app: INestApplication;
  let baseUrl = "";

  return {
    baseUrl: () => baseUrl,
    context,
    principals,
    async addMember(fixture, role = "VALET_EMPLOYEE", startShift = true) {
      return addMemberHelper(context, fixture, role, startShift);
    },
    async close() {
      if (app !== undefined) await app.close();
      await context.teardown();
    },
    async createKeySlot(fixture, code = "SLOT-01", status = "ACTIVE", locationIdOverride) {
      return createKeySlotHelper(context, fixture, code, status, locationIdOverride);
    },
    async createParkingSpot(fixture, zoneId, code = "SPOT-01", locationIdOverride) {
      return createParkingSpotHelper(context, fixture, zoneId, code, locationIdOverride);
    },
    async createParkingZone(fixture, code = "ZONE-01", locationIdOverride) {
      return createParkingZoneHelper(context, fixture, code, locationIdOverride);
    },
    async createSession(fixture, options = {}) {
      const sessionId = randomUUID();
      const vehicleId =
        options.vehicleId ??
        (await this.createVehicle(fixture, { temporaryDescriptor: "Test vehicle" }));
      const state = options.state ?? "CHECKING_IN";
      const conditionCompletedAt =
        options.checkInConditionCompletedAt !== undefined
          ? options.checkInConditionCompletedAt
          : state === "CHECKING_IN"
            ? null
            : new Date();
      const conditionCompletedBy =
        conditionCompletedAt === null ? null : fixture.membershipId;
      await context.adminPool.query(
        `INSERT INTO valet_sessions
           (id, customer_access_token_hash, customer_access_expires_at,
            organization_id, location_id, vehicle_id, state,
            checked_in_by_membership_id, check_in_condition_completed_at,
            check_in_condition_completed_by_membership_id,
            key_slot_id, parking_spot_id, parking_zone_id,
            parking_started_at, parked_at, version, updated_at)
         VALUES ($1, $2, transaction_timestamp() + interval '1 hour',
                 $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, transaction_timestamp())`,
        [
          sessionId,
          `hash:${sessionId}`,
          fixture.organizationId,
          fixture.locationId,
          vehicleId,
          state,
          fixture.membershipId,
          conditionCompletedAt,
          conditionCompletedBy,
          options.keySlotId ?? null,
          options.parkingSpotId ?? null,
          options.parkingZoneId ?? null,
          options.parkingStartedAt ?? null,
          options.parkedAt ?? null,
          options.version ?? 1,
        ],
      );
      return { sessionId, vehicleId };
    },
    async createTask(fixture, sessionId, options = {}) {
      const id = randomUUID();
      await context.adminPool.query(
        `INSERT INTO tasks
           (id, organization_id, location_id, valet_session_id, task_type,
            status, current_assignee_membership_id, version, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 1, transaction_timestamp())`,
        [
          id,
          fixture.organizationId,
          fixture.locationId,
          sessionId,
          options.taskType ?? "PARKING",
          options.status ?? "QUEUED",
          options.assigneeMembershipId ?? null,
        ],
      );
      return id;
    },
    async createVehicle(fixture, options = {}) {
      return createVehicleHelper(context, fixture, options);
    },
    async fixtureWithToken(options = {}) {
      const fixture = await context.createFixture(options);
      await context.adminPool.query(
        `INSERT INTO shifts
           (id, organization_id, location_id, membership_id, status, started_at)
         VALUES ($1, $2, $3, $4, 'ACTIVE', transaction_timestamp())`,
        [randomUUID(), fixture.organizationId, fixture.locationId, fixture.membershipId],
      );
      const token = `token-${randomUUID()}`;
      principals.set(`Bearer ${token}`, fixture.userId);
      return { fixture, token };
    },
    async request<T = Record<string, unknown>>(
      method: string,
      path: string,
      options: { readonly body?: unknown; readonly token?: string } = {},
    ) {
      const headers: Record<string, string> = {};
      if (options.token !== undefined) {
        headers.authorization = `Bearer ${options.token}`;
      }
      if (options.body !== undefined) {
        headers["content-type"] = "application/json";
      }
      const response = await fetch(`${baseUrl}${path}`, {
        headers,
        method,
        ...(options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
      });
      const text = await response.text();
      let body: unknown = {};
      try {
        body = JSON.parse(text);
      } catch {
        body = { raw: text };
      }
      return { body: body as T, status: response.status };
    },
    async start() {
      await context.setup();
      app = await NestFactory.create(TestStaffSessionModule, {
        logger: false,
      });
      await app.listen(0, "127.0.0.1");
      const address = app.getHttpServer().address() as { port: number };
      baseUrl = `http://127.0.0.1:${String(address.port)}`;
    },
  };
}
