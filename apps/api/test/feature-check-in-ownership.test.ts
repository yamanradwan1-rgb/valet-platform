import { MODULE_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";

import { CheckInApiService } from "../src/modules/check-in-api/check-in-api.service";
import { StaffCheckInController } from "../src/modules/check-in-api/check-in-api.controller";
import { CheckInModule } from "../src/modules/check-in-api/check-in.module";
import { CheckInOperationRunner } from "../src/modules/check-in-api/check-in-operation-runner";
import { CancelCheckInController } from "../src/modules/check-in-api/cancel-check-in.controller";
import { CancelCheckInService } from "../src/modules/check-in-api/cancel-check-in.service";
import { ConditionPhotoController } from "../src/modules/check-in-api/condition-photo.controller";
import { ConditionPhotoAuthGuard } from "../src/modules/check-in-api/condition-photo-auth.guard";
import { ConditionPhotoBackendService } from "../src/modules/vehicle-photos/condition-photo-backend.service";
import { ConditionPhotoMetricsPulse } from "../src/modules/vehicle-photos/condition-photo-metrics-pulse";
import { PlateOcrAuthGuard } from "../src/modules/check-in-api/plate-ocr-auth.guard";
import { PlateOcrController } from "../src/modules/check-in-api/plate-ocr.controller";
import { PlateOcrCostGuard } from "../src/modules/check-in-api/plate-ocr-cost-guard";
import { PLATE_OCR_PROVIDER } from "../src/modules/check-in-api/plate-ocr-provider";
import { PlateOcrService } from "../src/modules/check-in-api/plate-ocr.service";
import { ReturningCheckInController } from "../src/modules/check-in-api/returning-check-in.controller";

function metadata<T>(key: string): T[] {
  return (Reflect.getMetadata(key, CheckInModule) as T[] | undefined) ?? [];
}

describe("dedicated Check-In feature module ownership", () => {
  it("holds the exact accepted staff condition, cancellation and OCR controllers", () => {
    expect(metadata(MODULE_METADATA.CONTROLLERS)).toEqual([
      StaffCheckInController,
      CancelCheckInController,
      ReturningCheckInController,
      PlateOcrController,
      ConditionPhotoController,
    ]);
  });

  it("holds the exact API and photo providers without guest credential methods", () => {
    expect(metadata(MODULE_METADATA.PROVIDERS)).toEqual([
      CheckInApiService,
      CancelCheckInService,
      CheckInOperationRunner,
      PlateOcrAuthGuard,
      PlateOcrService,
      ConditionPhotoBackendService,
      ConditionPhotoMetricsPulse,
      ConditionPhotoAuthGuard,
      expect.objectContaining({ provide: PlateOcrCostGuard }),
      expect.objectContaining({ provide: PLATE_OCR_PROVIDER }),
    ]);
    for (const method of [
      "executeGuestIssue",
      "executeGuestRevoke",
      "resolveGuest",
      "resolveGuestInTransaction",
    ]) expect(method in CheckInApiService.prototype).toBe(false);
  });
});
