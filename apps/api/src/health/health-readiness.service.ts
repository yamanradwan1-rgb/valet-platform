import { Inject, Injectable, Logger } from "@nestjs/common";

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

  async isReady(): Promise<boolean> {
    if (this.drain.isDraining() || !this.requiredConfigurationReady()) {
      return this.record(false);
    }
    try {
      if (this.databaseCheckWaiters >= maxReadinessWaiters) {
        return this.record(false);
      }
      const check = this.sharedDatabaseCheck();
      this.databaseCheckWaiters += 1;
      try {
        await check;
      } finally {
        this.databaseCheckWaiters -= 1;
      }
      return this.record(
        !this.drain.isDraining() && this.requiredConfigurationReady(),
      );
    } catch {
      return this.record(false);
    }
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
