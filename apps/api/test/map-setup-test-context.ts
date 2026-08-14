import { randomUUID } from "node:crypto";
import {
  MiddlewareConsumer,
  Module,
  type INestApplication,
  type NestModule,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { RUNTIME_POSTGRES_POOL } from "../src/common/database/runtime-database.module";
import { HttpInfrastructureModule } from "../src/common/http/http-infrastructure.module";
import { RequestIdMiddleware } from "../src/common/http/api-request";
import {
  FailClosedStaffPrincipalResolver,
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../src/modules/auth/staff-principal";
import { MapSetupController } from "../src/modules/map-setup/map-setup.controller";
import { MapSetupService } from "../src/modules/map-setup/map-setup.service";
import {
  ShiftTestContext,
  type ShiftFixture,
  type ShiftFixtureOptions,
} from "./shift-test-context";

export interface MapSetupHttpResponse {
  readonly body: Record<string, unknown>;
  readonly status: number;
}

export class MapSetupTestContext {
  readonly database: ShiftTestContext;
  private app!: INestApplication;
  private baseUrl = "";
  private readonly principals = new Map<string, string>();

  constructor(label: string) {
    this.database = new ShiftTestContext(label);
  }

  async setup(): Promise<void> {
    await this.database.setup();
    const principals = this.principals;
    const resolver: StaffPrincipalResolver = {
      async resolve(authorization) {
        const userId =
          authorization === undefined
            ? undefined
            : principals.get(authorization);
        return userId === undefined
          ? new FailClosedStaffPrincipalResolver().resolve(authorization)
          : { userId };
      },
    };
    const runtimePool = this.database.runtimePool;
    @Module({
      controllers: [MapSetupController],
      imports: [HttpInfrastructureModule],
      providers: [
        MapSetupService,
        { provide: RUNTIME_POSTGRES_POOL, useValue: runtimePool },
        { provide: STAFF_PRINCIPAL_RESOLVER, useValue: resolver },
      ],
    })
    class TestMapSetupModule implements NestModule {
      configure(consumer: MiddlewareConsumer): void {
        consumer.apply(RequestIdMiddleware).forRoutes(MapSetupController);
      }
    }
    this.app = await NestFactory.create(TestMapSetupModule, { logger: false });
    await this.app.listen(0, "127.0.0.1");
    this.baseUrl = await this.app.getUrl();
  }

  async teardown(): Promise<void> {
    await this.app?.close();
    await this.database.teardown();
  }

  async actor(options: ShiftFixtureOptions = {}): Promise<{
    fixture: ShiftFixture;
    token: string;
  }> {
    const fixture = await this.database.createFixture({
      role: "LOCATION_MANAGER",
      ...options,
    });
    const token = randomUUID();
    this.principals.set(`Bearer ${token}`, fixture.userId);
    return { fixture, token };
  }

  async request(
    method: string,
    path: string,
    options: { readonly body?: unknown; readonly token?: string } = {},
  ): Promise<MapSetupHttpResponse> {
    const headers: Record<string, string> = {};
    if (options.token !== undefined) {
      headers.authorization = `Bearer ${options.token}`;
    }
    if (options.body !== undefined) headers["content-type"] = "application/json";
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    });
    return {
      body: (await response.json()) as Record<string, unknown>,
      status: response.status,
    };
  }

  async parkingZone(fixture: ShiftFixture): Promise<string> {
    const id = randomUUID();
    await this.database.adminPool.query(
      `INSERT INTO parking_zones
         (id, organization_id, location_id, code, label, updated_at)
       VALUES ($1, $2, $3, $4, 'Map setup zone', transaction_timestamp())`,
      [id, fixture.organizationId, fixture.locationId, randomUUID()],
    );
    return id;
  }

  async audit(resourceId: string) {
    return this.database.adminPool.query<{
      actor_membership_id: string;
      event_type: string;
      metadata_json: Record<string, unknown>;
    }>(
      `SELECT actor_membership_id::text, event_type, metadata_json
       FROM audit_events WHERE entity_id = $1 ORDER BY created_at`,
      [resourceId],
    );
  }
}

export const validPoint = {
  active: true,
  code: "ENTRANCE_MAIN",
  kind: "ENTRANCE" as const,
  label: "Main entrance",
  latitude: 31.9539,
  levelLabel: null,
  longitude: 35.9106,
};

export const validArea = {
  active: true,
  code: "PARKING_MAIN",
  label: "Main parking boundary",
  levelLabel: "B1",
  parkingZoneId: null,
  purpose: "PARKING" as const,
  vertices: [
    { latitude: 31.95, longitude: 35.91 },
    { latitude: 31.96, longitude: 35.91 },
    { latitude: 31.96, longitude: 35.92 },
  ],
};
