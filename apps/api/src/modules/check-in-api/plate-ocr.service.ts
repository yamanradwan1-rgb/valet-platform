import { Inject, Injectable } from "@nestjs/common";
import {
  plateOcrResponseSchema,
  type PlateOcrRequest,
  type PlateOcrResponse,
} from "@valet/contracts";
import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { CustodyStaffAuthorizationError } from "../staff/custody-staff-authorizer";
import { lockShiftOperationalEligibility } from "../shifts/shift-operational-eligibility";
import { authorizeCheckInLocation } from "./check-in-location-authorization";
import { logPlateOcrBoundary } from "./plate-ocr-boundary-diagnostics";
import { PlateOcrCostGuard } from "./plate-ocr-cost-guard";
import {
  PLATE_OCR_PROVIDER,
  type PlateOcrProvider,
} from "./plate-ocr-provider";

@Injectable()
export class PlateOcrService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    private readonly cost: PlateOcrCostGuard,
    @Inject(PLATE_OCR_PROVIDER) private readonly provider: PlateOcrProvider,
  ) {}

  async recognize(
    userId: string,
    input: PlateOcrRequest,
    image: Uint8Array,
  ): Promise<PlateOcrResponse> {
    const transaction = await this.pool.connect();
    let scope;
    try {
      await transaction.query("BEGIN");
      scope = await authorizeCheckInLocation(
        transaction,
        userId,
        input.targetLocationId,
        true,
      );
      logPlateOcrBoundary("location-authorized");
      const eligible = await lockShiftOperationalEligibility(transaction, {
        membershipId: scope.actor.membershipId,
        locationId: scope.locationId,
      });
      if (eligible === null) {
        logPlateOcrBoundary("shift-ineligible");
        throw new CustodyStaffAuthorizationError("AUTHORIZATION_DENIED");
      }
      logPlateOcrBoundary("shift-eligible");
      const policy = await transaction.query<{ enabled: boolean }>(
        `SELECT COALESCE(location.ocr_assist_enabled_override,
                         organization.ocr_assist_enabled) AS enabled
         FROM locations AS location
         INNER JOIN organizations AS organization
           ON organization.id = location.organization_id
         WHERE location.id = $1 AND location.organization_id = $2`,
        [scope.locationId, scope.organizationId],
      );
      if (policy.rows[0]?.enabled !== true) {
        logPlateOcrBoundary("tenant-policy-disabled");
        await transaction.query("COMMIT");
        return { status: "UNAVAILABLE" };
      }
      await transaction.query("COMMIT");
    } catch (error) {
      await transaction.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      transaction.release();
    }
    // Assistance takes no domain write locks across external HTTP I/O.
    const release = this.cost.acquire({
      organizationId: scope.organizationId,
      membershipId: scope.actor.membershipId,
      targetLocationId: scope.locationId,
    });
    if (release === undefined) {
      logPlateOcrBoundary("cost-guard-denied");
      return { status: "UNAVAILABLE" };
    }
    logPlateOcrBoundary("cost-guard-acquired");
    try {
      logPlateOcrBoundary("provider-dispatch");
      return plateOcrResponseSchema.parse(
        await this.provider.recognize({
          image,
          plateCountry: input.plateCountry,
        }),
      );
    } catch {
      return { status: "UNAVAILABLE" };
    } finally {
      release();
    }
  }
}
