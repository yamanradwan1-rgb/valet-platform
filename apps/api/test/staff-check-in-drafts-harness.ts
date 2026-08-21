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
import { StaffCheckInDraftsController } from "../src/modules/staff/staff-check-in-drafts.controller";
import { StaffCheckInDraftsService } from "../src/modules/staff/staff-check-in-drafts.service";
import {
  addMemberHelper,
  createVehicleHelper,
} from "./staff-valet-session-fixture-helpers";
import {
  ShiftTestContext,
  type ShiftFixture,
  type ShiftFixtureOptions,
  type TestRole,
} from "./shift-test-context";

export interface CreateDraftOptions {
  readonly checkInConditionCompletedAt?: Date | null;
  readonly createdAt?: Date;
  readonly creatorMembershipId?: string;
  readonly locationIdOverride?: string;
  readonly orgIdOverride?: string;
  readonly state?: string;
  readonly vehicleId?: string;
}

export interface StaffCheckInDraftsHarness {
  readonly baseUrl: () => string;
  readonly context: ShiftTestContext;
  readonly principals: Map<string, string>;
  addMember(
    fixture: ShiftFixture,
    role?: TestRole,
    startShift?: boolean,
  ): Promise<{ membershipId: string; userId: string }>;
  close(): Promise<void>;
  createDraft(
    fixture: ShiftFixture,
    options?: CreateDraftOptions,
  ): Promise<{ sessionId: string; vehicleId: string }>;
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
    options?: {
      readonly body?: unknown;
      readonly rawHeaders?: string[];
      readonly token?: string;
    },
  ): Promise<{ body: T; status: number }>;
  start(): Promise<void>;
}

export function createStaffCheckInDraftsHarness(): StaffCheckInDraftsHarness {
  const context = new ShiftTestContext("draft_disc");
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
    controllers: [StaffCheckInDraftsController],
    imports: [HttpInfrastructureModule],
    providers: [
      StaffCheckInDraftsService,
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
  class TestDraftsModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
      consumer
        .apply(RequestIdMiddleware)
        .forRoutes(StaffCheckInDraftsController);
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
    async createDraft(fixture, options = {}) {
      const sessionId = randomUUID();
      const vehicleId =
        options.vehicleId ??
        (await this.createVehicle(fixture, { temporaryDescriptor: "Test vehicle" }));
      const state = options.state ?? "CHECKING_IN";
      const orgId = options.orgIdOverride ?? fixture.organizationId;
      const locId = options.locationIdOverride ?? fixture.locationId;
      const creatorId = options.creatorMembershipId ?? fixture.membershipId;
      const conditionCompletedAt =
        options.checkInConditionCompletedAt !== undefined
          ? options.checkInConditionCompletedAt
          : null;
      const conditionCompletedBy =
        conditionCompletedAt === null ? null : creatorId;
      const createdAt = options.createdAt ?? new Date();

      const completedAt = state === "COMPLETED" ? new Date() : null;

      await context.adminPool.query(
        `INSERT INTO valet_sessions
           (id, customer_access_token_hash, customer_access_expires_at,
            organization_id, location_id, vehicle_id, state,
            checked_in_by_membership_id, check_in_condition_completed_at,
            check_in_condition_completed_by_membership_id,
            completed_at, created_at, version, updated_at)
         VALUES ($1, $2, transaction_timestamp() + interval '1 hour',
                 $3, $4, $5, $6, $7, $8, $9, $10, $11, 1, transaction_timestamp())`,
        [
          sessionId,
          `hash:${sessionId}`,
          orgId,
          locId,
          vehicleId,
          state,
          creatorId,
          conditionCompletedAt,
          conditionCompletedBy,
          completedAt,
          createdAt,
        ],
      );
      return { sessionId, vehicleId };
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
      options: {
        readonly body?: unknown;
        readonly rawHeaders?: string[];
        readonly token?: string;
      } = {},
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
      app = await NestFactory.create(TestDraftsModule, {
        logger: false,
      });
      await app.listen(0, "127.0.0.1");
      const address = app.getHttpServer().address() as { port: number };
      baseUrl = `http://127.0.0.1:${String(address.port)}`;
    },
  };
}
