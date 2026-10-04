import "reflect-metadata";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import { ShiftModule } from "../src/modules/shifts/shift.module";
import { ShiftController } from "../src/modules/shifts/shift.controller";
import { ShiftService } from "../src/modules/shifts/shift.service";
import { ShiftPresenceController } from "../src/modules/shifts/shift-presence.controller";
import { ShiftPresenceService } from "../src/modules/shifts/shift-presence.service";
import { AuthModule } from "../src/modules/auth/auth.module";
import { AntiAbuseModule } from "../src/modules/anti-abuse/anti-abuse.module";
import { STAFF_SESSION_CONTEXT_RESOLVER } from "../src/modules/auth/staff-session-context";

describe("GPS-B backend module ownership", () => {
  it("owns Shift and focused presence controllers/services in the existing Shift module", () => {
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, ShiftModule)).toContain(
      AntiAbuseModule,
    );
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, ShiftModule),
    ).toEqual([ShiftController, ShiftPresenceController]);
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ShiftModule)).toEqual(
      [ShiftService, ShiftPresenceService],
    );
  });
  it("imports the production authentication module with a mandatory exact-session resolver", () => {
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, ShiftModule)).toContain(
      AuthModule,
    );
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, AuthModule)).toContain(
      STAFF_SESSION_CONTEXT_RESOLVER,
    );
  });
});
