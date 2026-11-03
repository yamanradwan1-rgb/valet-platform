import {
  type ManagementAlertTimingPreferencesResponse,
  type ManagementAlertTimingPreferencesSetRequest,
} from "@valet/contracts";
import { Inject, Injectable } from "@nestjs/common";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { recordAdminActivityInTransaction } from "../auth/mfa/mfa-assurance-policy";
import { authorizeOwnManagementAlertTimingPreferences } from "./management-alert-timing-authority";
import {
  readOwnAlertTimingPreferences,
  saveOwnAlertTimingPreferences,
} from "./management-alert-timing-repository";

interface OwnPreferenceRequest {
  readonly context: StaffSessionContext;
  readonly organizationId: string;
  readonly locationId: string;
}

@Injectable()
export class ManagementAlertTimingPreferencesService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  read(
    input: OwnPreferenceRequest,
  ): Promise<ManagementAlertTimingPreferencesResponse> {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const scope = await authorizeOwnManagementAlertTimingPreferences(
        transaction,
        input.context,
        {
          organizationId: input.organizationId,
          locationId: input.locationId,
          sensitiveWrite: false,
        },
      );
      // No audit, admin activity or default-row creation on GET.
      return readOwnAlertTimingPreferences(transaction, scope);
    });
  }

  save(
    input: OwnPreferenceRequest,
    command: ManagementAlertTimingPreferencesSetRequest,
  ): Promise<ManagementAlertTimingPreferencesResponse> {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const scope = await authorizeOwnManagementAlertTimingPreferences(
        transaction,
        input.context,
        {
          organizationId: input.organizationId,
          locationId: input.locationId,
          sensitiveWrite: true,
        },
      );
      const result = await saveOwnAlertTimingPreferences(
        transaction,
        scope,
        command.values,
        command.expectedRevision,
      );
      // An explicit successful Company Admin Settings save is an interactive
      // admin action. GET and background alert reads never record activity.
      if (scope.role === "ORG_ADMIN") {
        await recordAdminActivityInTransaction(transaction, input.context);
      }
      return result;
    });
  }
}
