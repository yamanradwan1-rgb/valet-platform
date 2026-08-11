import { MODULE_METADATA } from "@nestjs/common/constants";
import { APP_FILTER } from "@nestjs/core";
import { describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { RuntimeDatabaseModule } from "../src/common/database/runtime-database.module";
import { ApiExceptionFilter } from "../src/common/http/api-exception.filter";
import { ApiOperationRunner } from "../src/common/http/api-operation-runner";
import { HttpInfrastructureModule } from "../src/common/http/http-infrastructure.module";
import { AntiAbuseModule } from "../src/modules/anti-abuse/anti-abuse.module";
import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import { AntiAbuseService } from "../src/modules/anti-abuse/anti-abuse.service";
import { TrustedClientAddressResolver } from "../src/modules/anti-abuse/client-address";
import { AuthModule } from "../src/modules/auth/auth.module";
import { StaffAuthController } from "../src/modules/auth/staff-auth.controller";
import { STAFF_PRINCIPAL_RESOLVER } from "../src/modules/auth/staff-principal";
import { StaffCheckInController } from "../src/modules/check-in-api/check-in-api.controller";
import { CheckInApiService } from "../src/modules/check-in-api/check-in-api.service";
import { CheckInModule } from "../src/modules/check-in-api/check-in.module";
import { CheckInOperationRunner } from "../src/modules/check-in-api/check-in-operation-runner";
import {
  GuestAccessController,
  StaffGuestAccessController,
} from "../src/modules/guest-access/guest-access.controller";
import { GuestAccessModule } from "../src/modules/guest-access/guest-access.module";
import { GuestAccessService } from "../src/modules/guest-access/guest-access.service";

function metadata<T>(module: object, key: string): T[] {
  return (Reflect.getMetadata(key, module) as T[] | undefined) ?? [];
}

describe("accepted feature module ownership", () => {
  it("composes the four accepted feature modules directly from AppModule", () => {
    expect(metadata(AppModule, MODULE_METADATA.IMPORTS)).toEqual([
      AuthModule,
      AntiAbuseModule,
      GuestAccessModule,
      CheckInModule,
    ]);
  });

  it("keeps Auth ownership and exports only staff principal resolution", () => {
    expect(metadata(AuthModule, MODULE_METADATA.CONTROLLERS)).toEqual([
      StaffAuthController,
    ]);
    expect(metadata(AuthModule, MODULE_METADATA.EXPORTS)).toEqual([
      STAFF_PRINCIPAL_RESOLVER,
    ]);
  });

  it("keeps one Anti-Abuse provider path", () => {
    expect(metadata(AntiAbuseModule, MODULE_METADATA.IMPORTS)).toEqual([
      RuntimeDatabaseModule,
    ]);
    expect(metadata(AntiAbuseModule, MODULE_METADATA.EXPORTS)).toEqual([
      AntiAbuseKeyDeriver,
      AntiAbuseService,
      TrustedClientAddressResolver,
    ]);
  });

  it("owns issue, revoke, and guest read under Guest Access", () => {
    expect(metadata(GuestAccessModule, MODULE_METADATA.CONTROLLERS)).toEqual([
      StaffGuestAccessController,
      GuestAccessController,
    ]);
    expect(metadata(GuestAccessModule, MODULE_METADATA.PROVIDERS)).toEqual([
      GuestAccessService,
    ]);
  });

  it("keeps Check-In limited to staff Check-In ownership", () => {
    expect(metadata(CheckInModule, MODULE_METADATA.CONTROLLERS)).toEqual([
      StaffCheckInController,
    ]);
    expect(metadata(CheckInModule, MODULE_METADATA.PROVIDERS)).toEqual([
      CheckInApiService,
      CheckInOperationRunner,
    ]);
    for (const method of [
      "executeGuestIssue",
      "executeGuestRevoke",
      "resolveGuest",
      "resolveGuestInTransaction",
    ]) {
      expect(method in CheckInApiService.prototype).toBe(false);
    }
  });

  it("provides the neutral runner and one global exception filter", () => {
    expect(
      metadata(HttpInfrastructureModule, MODULE_METADATA.PROVIDERS),
    ).toEqual([
      ApiOperationRunner,
      expect.any(Function),
      { provide: APP_FILTER, useClass: ApiExceptionFilter },
    ]);
    const filterRegistrations = metadata<object>(
      HttpInfrastructureModule,
      MODULE_METADATA.PROVIDERS,
    ).filter(
      (provider) =>
        typeof provider === "object" &&
        provider !== null &&
        "provide" in provider &&
        provider.provide === APP_FILTER,
    );
    expect(filterRegistrations).toHaveLength(1);
  });
});
