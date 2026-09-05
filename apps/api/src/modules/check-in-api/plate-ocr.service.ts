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
      );
      const eligible = await lockShiftOperationalEligibility(transaction, {
        membershipId: scope.actor.membershipId,
        locationId: scope.locationId,
      });
      if (eligible === null)
        throw new CustodyStaffAuthorizationError("AUTHORIZATION_DENIED");
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
    if (release === undefined) return { status: "UNAVAILABLE" };
    try {
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
