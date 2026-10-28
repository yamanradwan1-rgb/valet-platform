import { Inject, Injectable, Logger } from "@nestjs/common";

import type { ApiRequest } from "../common/http/api-request";
import {
  recordInfrastructureRequestFailure,
  recordRequestFailure,
} from "../common/observability/performance-request-diagnostics";
import type { PostgresPool } from "../common/database/postgres";
import { verifyRuntimeDatabaseReadiness } from "../common/database/runtime-database-readiness";
import { RUNTIME_POSTGRES_POOL } from "../common/database/runtime-database.module";
import { AntiAbuseKeyDeriver } from "../modules/anti-abuse/anti-abuse-key";
import { GuestAuthOriginPolicy } from "../modules/guest-access/guest-browser-transport";
import { guestRatePolicyMode } from "../modules/guest-access/guest-request-policy";
import { ApplicationDrainState } from "./application-drain-state";

type ReadinessState = "ready" | "unavailable";
const maxReadinessWaiters = 128;

@Injectable()
export class HealthReadinessService {
  private readonly logger = new Logger("T4Readiness");
  private lastState: ReadinessState | undefined;
  private inFlightDatabaseCheck: Promise<void> | undefined;
  private databaseCheckWaiters = 0;

  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    private readonly drain: ApplicationDrainState,
    private readonly antiAbuseKeys: AntiAbuseKeyDeriver,
    private readonly guestOrigins: GuestAuthOriginPolicy,
  ) {}

  async isReady(request?: ApiRequest): Promise<boolean> {
    if (!this.localReadiness(request)) {
      return this.record(false);
    }
    try {
      if (this.databaseCheckWaiters >= maxReadinessWaiters) {
        if (request)
          recordInfrastructureRequestFailure(request, "READINESS_QUEUE_FULL");
        return this.record(false);
      }
      const check = this.sharedDatabaseCheck();
      this.databaseCheckWaiters += 1;
      try {
        await check;
      } finally {
        this.databaseCheckWaiters -= 1;
      }
      return this.record(this.localReadiness(request));
    } catch (error) {
      if (request) recordRequestFailure(request, "NONE", error);
      return this.record(false);
    }
  }

  private localReadiness(request?: ApiRequest): boolean {
    const reason = this.drain.isDraining()
      ? "DRAINING"
      : !this.requiredConfigurationReady()
        ? "CONFIGURATION_UNAVAILABLE"
        : undefined;
    if (reason === undefined) return true;
    if (request) recordInfrastructureRequestFailure(request, reason);
    return false;
  }

  private requiredConfigurationReady(): boolean {
    try {
      guestRatePolicyMode();
      this.antiAbuseKeys.derive(
        "v1:guest-client-address",
        "t4-readiness-config-check",
      );
      return (
        process.env.NODE_ENV !== "production" ||
        this.guestOrigins.allowedOrigins.size > 0
      );
    } catch {
      return false;
    }
  }

  private sharedDatabaseCheck(): Promise<void> {
    if (this.inFlightDatabaseCheck !== undefined) {
      return this.inFlightDatabaseCheck;
    }
    const check = verifyRuntimeDatabaseReadiness(this.pool).finally(() => {
      if (this.inFlightDatabaseCheck === check) {
        this.inFlightDatabaseCheck = undefined;
      }
    });
    this.inFlightDatabaseCheck = check;
    return check;
  }

  private record(ready: boolean): boolean {
    const state: ReadinessState = ready ? "ready" : "unavailable";
    if (state !== this.lastState) {
      this.lastState = state;
      this.logger.log(`T4_READINESS state=${state}`);
    }
    return ready;
  }
}
