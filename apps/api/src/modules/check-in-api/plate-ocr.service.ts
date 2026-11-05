import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import {
  plateOcrResponseSchema,
  type PlateOcrRequest,
  type PlateOcrResponse,
} from "@valet/contracts";
import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { lockAndRecheckStaffSessionContext } from "../auth/staff-session-revalidation";
import { CustodyStaffAuthorizationError } from "../staff/custody-staff-authorizer";
import { lockShiftOperationalEligibility } from "../shifts/shift-operational-eligibility";
import { authorizeCheckInLocation } from "./check-in-location-authorization";
import { PlateOcrAdmissionExecutor } from "./plate-ocr-admission/plate-ocr-admission-executor";
import { logPlateOcrBoundary } from "./plate-ocr-boundary-diagnostics";
import { PlateOcrCostGuard } from "./plate-ocr-cost-guard";
import {
  PLATE_OCR_PROVIDER,
  type PlateOcrObservedResult,
  type PlateOcrProvider,
} from "./plate-ocr-provider";
import { settleOcr } from "./plate-ocr-recovery/ocr-settle";

const unavailable: PlateOcrResponse = { status: "UNAVAILABLE" };

@Injectable()
export class PlateOcrService {
  private readonly logger = new Logger("PlateOcrService");
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    private readonly cost: PlateOcrCostGuard,
    private readonly admission: PlateOcrAdmissionExecutor,
    @Inject(PLATE_OCR_PROVIDER) private readonly provider: PlateOcrProvider,
  ) {}

  async recognize(
    session: StaffSessionContext,
    input: PlateOcrRequest,
    image: Uint8Array,
    signal: AbortSignal,
  ): Promise<PlateOcrResponse> {
    if (signal.aborted || !this.provider.canDispatch()) return unavailable;
    const timeoutMs = this.provider.admissionTimeoutMs();
    if (timeoutMs === undefined) return unavailable;
    if (this.cost.isControlledNonProduction()) {
      return this.recognizeControlledDevelopment(session, input, image, signal);
    }
    return this.recognizeShared(session, input, image, signal, timeoutMs);
  }

  /** Retains DEC-074 controlled single-process dev/test smoke behavior only. */
  private async recognizeControlledDevelopment(
    session: StaffSessionContext,
    input: PlateOcrRequest,
    image: Uint8Array,
    signal: AbortSignal,
  ): Promise<PlateOcrResponse> {
    const transaction = await this.pool.connect();
    let scope;
    try {
      await transaction.query("BEGIN");
      if (!(await lockAndRecheckStaffSessionContext(transaction, session))) {
        throw new UnauthorizedException();
      }
      scope = await authorizeCheckInLocation(
        transaction,
        session.userId,
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
        return unavailable;
      }
      await transaction.query("COMMIT");
    } catch (error) {
      await transaction.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      transaction.release();
    }
    // Assistance takes no domain write locks across external HTTP I/O.
    if (signal.aborted) return unavailable;
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
    try {
      if (signal.aborted) return unavailable;
      logPlateOcrBoundary("provider-dispatch");
      return plateOcrResponseSchema.parse(
        (
          await this.provider.recognizeObserved(
            { image, plateCountry: input.plateCountry },
            {
              signal,
              permit: { consumeIfFresh: () => !signal.aborted },
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

  /** One known-committed A, one bounded fetch, one scoped attempt-only S. */
  private async recognizeShared(
    session: StaffSessionContext,
    input: PlateOcrRequest,
    image: Uint8Array,
    signal: AbortSignal,
    providerTimeoutMs: number,
  ): Promise<PlateOcrResponse> {
    const admitted = await this.admission.admit(
      session,
      input.targetLocationId,
      providerTimeoutMs,
    );
    if (admitted.status !== "ADMITTED") return unavailable;

    // A provider implementation that unexpectedly throws after invoking fetch
    // must never be classified NOT_SENT or have remote capacity released.
    let observed: PlateOcrObservedResult = {
      response: unavailable,
      fetchInvoked: true,
      disposition: "UNKNOWN",
      observationClass: "UNCERTAIN",
      httpClass: "NONE",
      failureClass: "OTHER",
      httpResponseComplete: false,
      durationMs: 0,
    };
    try {
      observed = await this.provider.recognizeObserved(
        { image, plateCountry: input.plateCountry },
        {
          signal,
          permit: {
            consumeIfFresh: () =>
              !signal.aborted && admitted.permit.consumeIfFresh(),
          },
        },
      );
    } catch {
      this.logger.warn("PLATE_OCR_PROVIDER_OBSERVATION_UNAVAILABLE");
    }
    try {
      await settleOcr(this.pool, admitted.attempt, observed);
    } catch {
      // Store unavailability retains persisted liability; never repeat fetch.
      this.logger.warn("PLATE_OCR_SETTLEMENT_UNAVAILABLE");
    }
    const projected = plateOcrResponseSchema.safeParse(observed.response);
    return projected.success ? projected.data : unavailable;
  }
}
