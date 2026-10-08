import { Inject, Injectable, Logger } from "@nestjs/common";

import type { PostgresPool } from "../common/database/postgres";
import { verifyRuntimeDatabaseReadiness } from "../common/database/runtime-database-readiness";
import { RUNTIME_POSTGRES_POOL } from "../common/database/runtime-database.module";
import { AntiAbuseKeyDeriver } from "../modules/anti-abuse/anti-abuse-key";
import { GuestAuthOriginPolicy } from "../modules/guest-access/guest-browser-transport";
import { guestRatePolicyMode } from "../modules/guest-access/guest-request-policy";
import { ApplicationDrainState } from "./application-drain-state";

type ReadinessState = "ready" | "unavailable";

@Injectable()
export class HealthReadinessService {
  private readonly logger = new Logger("T4Readiness");
  private lastState: ReadinessState | undefined;

  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    private readonly drain: ApplicationDrainState,
    private readonly antiAbuseKeys: AntiAbuseKeyDeriver,
    private readonly guestOrigins: GuestAuthOriginPolicy,
  ) {}

  async isReady(): Promise<boolean> {
    if (this.drain.isDraining()) return this.record(false);
    try {
      guestRatePolicyMode();
      this.antiAbuseKeys.derive(
        "v1:guest-client-address",
        "t4-readiness-config-check",
      );
      if (
        process.env.NODE_ENV === "production" &&
        this.guestOrigins.allowedOrigins.size === 0
      ) {
        return this.record(false);
      }
      await verifyRuntimeDatabaseReadiness(this.pool);
      return this.record(!this.drain.isDraining());
    } catch {
      return this.record(false);
    }
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
