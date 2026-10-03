import type { ManagementLocationLifecycleResponse } from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import { ManagementAccessDeniedError } from "./management-authorization";
import {
  isSupportedLocationCurrency,
  isValidLocationTimezone,
} from "./management-location-policy";

interface LocationLifecycleRow {
  readonly acceptingIntake: boolean;
  readonly activeShiftPresent: boolean;
  readonly addressText: string;
  readonly code: string;
  readonly currency: string;
  readonly locationId: string;
  readonly name: string;
  readonly nonCompletedValetSessionPresent: boolean;
  readonly nonTerminalTaskPresent: boolean;
  readonly organizationId: string;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly timezone: string;
  readonly updatedAt: Date;
}

export async function locationLifecycleProjection(
  transaction: PostgresTransaction,
  organizationId: string,
  locationId: string,
): Promise<ManagementLocationLifecycleResponse> {
  const result = await transaction.query<LocationLifecycleRow>(
    `SELECT location.id::text AS "locationId",
            location.organization_id::text AS "organizationId",
            location.name,location.code,location.address_text AS "addressText",
            location.timezone,location.currency,location.status::text AS status,
            location.accepting_intake AS "acceptingIntake",location.updated_at AS "updatedAt",
            EXISTS(SELECT 1 FROM shifts WHERE organization_id=$1 AND location_id=$2
              AND status='ACTIVE') AS "activeShiftPresent",
            EXISTS(SELECT 1 FROM tasks WHERE organization_id=$1 AND location_id=$2
              AND status IN ('QUEUED','ASSIGNED','ACCEPTED','IN_PROGRESS'))
              AS "nonTerminalTaskPresent",
            EXISTS(SELECT 1 FROM valet_sessions WHERE organization_id=$1 AND location_id=$2
              AND state NOT IN ('COMPLETED','CANCELLED')) AS "nonCompletedValetSessionPresent"
       FROM locations AS location
       WHERE location.organization_id=$1 AND location.id=$2`,
    [organizationId, locationId],
  );
  const row = result.rows[0];
  if (row === undefined) throw new ManagementAccessDeniedError();
  const currencySupported = isSupportedLocationCurrency(row.currency);
  const timezoneValid = isValidLocationTimezone(row.timezone);
  const blocked =
    row.activeShiftPresent ||
    row.nonTerminalTaskPresent ||
    row.nonCompletedValetSessionPresent;
  return {
    acceptingIntake: row.acceptingIntake,
    addressText: row.addressText,
    code: row.code,
    currency: row.currency,
    drain: {
      activeShiftPresent: row.activeShiftPresent,
      blocked,
      nonCompletedValetSessionPresent: row.nonCompletedValetSessionPresent,
      nonTerminalTaskPresent: row.nonTerminalTaskPresent,
    },
    locationId: row.locationId,
    name: row.name,
    organizationId: row.organizationId,
    readiness: {
      checks: { currencySupported, timezoneValid },
      readyForActivation: currencySupported && timezoneValid,
    },
    status: row.status,
    timezone: row.timezone,
    updatedAt: row.updatedAt.toISOString(),
  };
}
