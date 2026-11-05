import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { Module, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { PlateOcrResponse } from "@valet/contracts";
import { RUNTIME_POSTGRES_POOL } from "../src/common/database/runtime-database.module";
import { HttpInfrastructureModule } from "../src/common/http/http-infrastructure.module";
import {
  DatabaseStaffPrincipalResolver,
  STAFF_AUTH_DUMMY_PASSWORD_HASH,
  StaffAuthService,
} from "../src/modules/auth/staff-auth.service";
import { STAFF_PRINCIPAL_RESOLVER } from "../src/modules/auth/staff-principal";
import { PlateOcrAuthGuard } from "../src/modules/check-in-api/plate-ocr-auth.guard";
import { PlateOcrController } from "../src/modules/check-in-api/plate-ocr.controller";
import { PlateOcrService } from "../src/modules/check-in-api/plate-ocr.service";
import { PlateOcrCostGuard } from "../src/modules/check-in-api/plate-ocr-cost-guard";
import { PLATE_OCR_PROVIDER } from "../src/modules/check-in-api/plate-ocr-provider";
import {
  STAFF_SESSION_CONTEXT_RESOLVER,
  DatabaseStaffSessionContextResolver,
} from "../src/modules/auth/staff-session-context";
import { CheckInOperationRunner } from "../src/modules/check-in-api/check-in-operation-runner";
import { ReturningCheckInTestContext } from "./returning-check-in-test-context";

export class PlateOcrHttpContext extends ReturningCheckInTestContext {
  app!: INestApplication;
  origin = "";
  calls = 0;
  time = 0;
  mode = "test";
  guard!: PlateOcrCostGuard;
  result: () => Promise<PlateOcrResponse> = async () => ({
    status: "NO_MATCH",
  });
  override async start() {
    await super.start();
    const runtime = this.runtime;
    const acquire = (identity: Parameters<PlateOcrCostGuard["acquire"]>[0]) =>
      this.guard.acquire(identity);
    const isControlledNonProduction = () =>
      this.guard.isControlledNonProduction();
    const recognize = async () => {
      this.calls++;
      return this.result();
    };
    @Module({
      imports: [HttpInfrastructureModule],
      controllers: [PlateOcrController],
      providers: [
        PlateOcrService,
        PlateOcrAuthGuard,
        CheckInOperationRunner,
        { provide: RUNTIME_POSTGRES_POOL, useValue: runtime },
        {
          provide: STAFF_PRINCIPAL_RESOLVER,
          useValue: new DatabaseStaffPrincipalResolver(runtime),
        },
        {
          provide: STAFF_SESSION_CONTEXT_RESOLVER,
          useValue: new DatabaseStaffSessionContextResolver(runtime),
        },
        {
          provide: PlateOcrCostGuard,
          useValue: { acquire, isControlledNonProduction },
        },
        {
          provide: PLATE_OCR_PROVIDER,
          useValue: {
            recognize,
            canDispatch: () => true,
            recognizeObserved: async (
              _input: unknown,
              options: {
                signal: AbortSignal;
                permit: { consumeIfFresh(): boolean };
              },
            ) => {
              const invoked =
                !options.signal.aborted && options.permit.consumeIfFresh();
              if (!invoked) {
                return {
                  response: { status: "UNAVAILABLE" },
                  fetchInvoked: false,
                  disposition: "NOT_SENT",
                  observationClass: "NOT_INVOKED",
                  httpClass: "NONE",
                  failureClass: "NONE",
                  durationMs: 0,
                };
              }
              return {
                response: await recognize(),
                fetchInvoked: true,
                disposition: "UNKNOWN",
                observationClass: "UNCERTAIN",
                httpClass: "NONE",
                failureClass: "NONE",
                durationMs: 0,
              };
            },
          },
        },
      ],
    })
    class TestModule {}
    this.reset();
    this.app = await NestFactory.create(TestModule, { logger: false });
    await this.app.listen(0, "127.0.0.1");
    this.origin = await this.app.getUrl();
  }
  reset(mode = "test") {
    this.calls = 0;
    this.time = 0;
    this.mode = mode;
    // This harness injects a synthetic provider only; its API binds loopback.
    this.guard = new PlateOcrCostGuard(mode, () => this.time, 1024, true);
    this.result = async () => ({ status: "NO_MATCH" });
  }
  override async stop() {
    await this.app?.close();
    await super.stop();
  }
  async staff(shift = true) {
    const fixture = await this.fixture();
    const email = `${fixture.userId}@ocr.test`;
    await this.admin.query(
      "UPDATE users SET email = $1, password_hash = $2 WHERE id = $3",
      [email, STAFF_AUTH_DUMMY_PASSWORD_HASH, fixture.userId],
    );
    // Password hashing is outside this route's scope; credentials/session resolution are real.
    const tokens = await new StaffAuthService(this.runtime, {
      verify: async () => true,
    }).login(email, "test-only");
    if (shift)
      await this.admin.query(
        `INSERT INTO shifts (id, organization_id, location_id, membership_id, started_at)
       VALUES ($1, $2, $3, $4, clock_timestamp())`,
        [
          randomUUID(),
          fixture.organizationId,
          fixture.locationId,
          fixture.membershipId,
        ],
      );
    return { ...fixture, token: tokens.accessToken };
  }
  async request(
    token: string | undefined,
    fields: Record<string, string>,
    bytes = new Uint8Array([255, 216, 255, 217]),
    type = "image/jpeg",
  ) {
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) body.append(key, value);
    body.append("image", new Blob([bytes], { type }), "plate.jpg");
    return fetch(`${this.origin}/v1/staff/check-in/plate-ocr`, {
      method: "POST",
      body,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }
}
