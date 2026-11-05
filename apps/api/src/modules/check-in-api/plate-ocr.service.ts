import {
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import {
  plateOcrResponseSchema,
  type PlateOcrRequest,
  type PlateOcrResponse,
} from "@valet/contracts";
import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { lockAndRecheckStaffSessionContext } from "../auth/staff-session-revalidation";
import { CustodyStaffAuthorizationError } from "../staff/custody-staff-authorizer";
import { lockShiftOperationalEligibility } from "../shifts/shift-operational-eligibility";
import { authorizeCheckInLocation } from "./check-in-location-authorization";
import { logPlateOcrBoundary } from "./plate-ocr-boundary-diagnostics";
import { PlateOcrCostGuard } from "./plate-ocr-cost-guard";
import {
  PLATE_OCR_PROVIDER,
  type PlateOcrProvider,
} from "./plate-ocr-provider";

const unavailable: PlateOcrResponse = { status: "UNAVAILABLE" };
// A bounded gap between locked authorization proof and the one provider send.
const MAX_PROOF_AGE_MS = 250;

@Injectable()
export class PlateOcrService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    private readonly cost: PlateOcrCostGuard,
    @Inject(PLATE_OCR_PROVIDER) private readonly provider: PlateOcrProvider,
  ) {}

  async recognize(
    session: StaffSessionContext,
    input: PlateOcrRequest,
    image: Uint8Array,
    signal: AbortSignal,
  ): Promise<PlateOcrResponse> {
    if (signal.aborted || !this.provider.canDispatch()) return unavailable;
    let proof;
    try {
      proof = await inPostgresTransaction(this.pool, async (transaction) => {
        if (!(await lockAndRecheckStaffSessionContext(transaction, session)))
          throw new UnauthorizedException();
        const scope = await authorizeCheckInLocation(
          transaction, session.userId, input.targetLocationId, true,
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
          return undefined;
        }
        return { scope, proofAt: performance.now() };
      });
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof CustodyStaffAuthorizationError
      )
        throw error;
      return unavailable;
    }
    if (!proof) return unavailable;
    const { scope, proofAt } = proof;
    // No DB lock spans external I/O; rate protection is process-local, not quota.
    if (signal.aborted || performance.now() - proofAt > MAX_PROOF_AGE_MS)
      return unavailable;
    const release = this.cost.acquire({
      organizationId: scope.organizationId,
      membershipId: scope.actor.membershipId,
      targetLocationId: scope.locationId,
    });
    if (release === undefined) {
      logPlateOcrBoundary("cost-guard-denied");
      return unavailable;
    }
    logPlateOcrBoundary("cost-guard-acquired");
    let consumed = false;
    try {
      if (signal.aborted) return unavailable;
      logPlateOcrBoundary("provider-dispatch");
      return plateOcrResponseSchema.parse(
        (
          await this.provider.recognizeObserved(
            { image, plateCountry: input.plateCountry },
            {
              signal,
              permit: {
                consumeIfFresh: () => {
                  if (
                    consumed ||
                    signal.aborted ||
                    performance.now() - proofAt > MAX_PROOF_AGE_MS
                  )
                    return false;
                  consumed = true;
                  return true;
                },
              },
            },
          )
        ).response,
      );
    } catch {
      return unavailable;
    } finally {
      release();
    }
  }
}
