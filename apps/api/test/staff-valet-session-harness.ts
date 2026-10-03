import { CancelCheckInController } from "../src/modules/check-in-api/cancel-check-in.controller";
import { CancelCheckInService } from "../src/modules/check-in-api/cancel-check-in.service";
import { CheckInOperationRunner } from "../src/modules/check-in-api/check-in-operation-runner";
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
import { IncidentReportingController } from "../src/modules/incidents/incident-reporting.controller";
import { IncidentReportingService } from "../src/modules/incidents/incident-reporting.service";
import { IncidentRecoveryController } from "../src/modules/incidents/incident-recovery.controller";
import { IncidentRecoveryService } from "../src/modules/incidents/incident-recovery.service";
import { StaffValetSessionService } from "../src/modules/staff/staff-valet-session.service";
import { StaffVehicleDirectoryService } from "../src/modules/staff/staff-vehicle-directory.service";
import {
  addMemberHelper,
  createKeySlotHelper,
  createParkingSpotHelper,
  createParkingZoneHelper,
  createSessionHelper,
  createVehicleHelper,
  type SessionFixtureOptions,
} from "./staff-valet-session-fixture-helpers";
import {
  ShiftTestContext,
  type ShiftFixture,
  type ShiftFixtureOptions,
  type TestRole,
} from "./shift-test-context";
import {
  staffHarnessRequest,
  type StaffHarnessRequestOptions,
} from "./staff-harness-http";

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
    options?: StaffHarnessRequestOptions,
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
    controllers: [
      StaffValetSessionController,
      CancelCheckInController,
      IncidentReportingController,
      IncidentRecoveryController,
    ],
    imports: [HttpInfrastructureModule],
    providers: [
      StaffValetSessionService,
      CancelCheckInService,
      CheckInOperationRunner,
      StaffVehicleDirectoryService,
      IncidentReportingService,
      IncidentRecoveryService,
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
        .forRoutes(
          StaffValetSessionController,
          CancelCheckInController,
          IncidentReportingController,
          IncidentRecoveryController,
        );
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
    async createKeySlot(
      fixture,
      code = "SLOT-01",
      status = "ACTIVE",
      locationIdOverride,
    ) {
      return createKeySlotHelper(
        context,
        fixture,
        code,
        status,
        locationIdOverride,
      );
    },
    async createParkingSpot(
      fixture,
      zoneId,
      code = "SPOT-01",
      locationIdOverride,
    ) {
      return createParkingSpotHelper(
        context,
        fixture,
        zoneId,
        code,
        locationIdOverride,
      );
    },
    async createParkingZone(fixture, code = "ZONE-01", locationIdOverride) {
      return createParkingZoneHelper(
        context,
        fixture,
        code,
        locationIdOverride,
      );
    },
    async createSession(fixture, options = {}) {
      const vehicleId =
        options.vehicleId ??
        (await this.createVehicle(fixture, {
          temporaryDescriptor: "Test vehicle",
        }));
      const sessionId = await createSessionHelper(
        context,
        fixture,
        vehicleId,
        options,
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
        [
          randomUUID(),
          fixture.organizationId,
          fixture.locationId,
          fixture.membershipId,
        ],
      );
      const token = `token-${randomUUID()}`;
      principals.set(`Bearer ${token}`, fixture.userId);
      return { fixture, token };
    },
    async request<T = Record<string, unknown>>(
      method: string,
      path: string,
      options: StaffHarnessRequestOptions = {},
    ) {
      return staffHarnessRequest<T>(baseUrl, method, path, options);
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
