import { join } from "node:path";

import { Client } from "pg";

import { Argon2StaffPasswordVerifier } from "../../src/modules/auth/staff-auth.service";
import {
  LOCAL_SMOKE_EMPLOYEE_EMAIL,
  LOCAL_SMOKE_EMPLOYEE_PASSWORD,
  type QueryableClient,
} from "./demo-employee-credential";
import {
  loadStatusEnvironment,
  LOCAL_SERVICE_URLS,
} from "./local-dev-environment";
import {
  classifyResourceRows,
  formatOccupancyLines,
  KEY_SLOT_OCCUPANCY_SQL,
  PARKING_SPOT_OCCUPANCY_SQL,
  toResourceOccupancyRows,
} from "./resource-status";

const DATABASE_IDENTITY_SQL =
  "SELECT current_database() AS database_name, current_user AS connected_role";

const EMPLOYEE_IDENTITY_SQL = [
  "SELECT u.id AS user_id, u.email AS email, u.status AS user_status,",
  "       m.role AS membership_role, m.status AS membership_status",
  "FROM users u",
  "LEFT JOIN organization_memberships m ON m.user_id = u.id",
  "WHERE u.email = $1",
].join(" ");

const EMPLOYEE_LOCATION_ACCESS_SQL = [
  "SELECT DISTINCT l.code AS code",
  "FROM membership_location_access mla",
  "JOIN organization_memberships m ON m.id = mla.membership_id",
  "JOIN users u ON u.id = m.user_id",
  "JOIN locations l ON l.id = mla.location_id",
  "WHERE u.email = $1",
].join(" ");

const EMPLOYEE_ACTIVE_SHIFT_SQL = [
  "SELECT count(*)::int AS active_shifts",
  "FROM shifts s",
  "JOIN organization_memberships m ON m.id = s.membership_id",
  "JOIN users u ON u.id = m.user_id",
  "WHERE u.email = $1 AND s.status = 'ACTIVE'",
].join(" ");

const EMPLOYEE_PASSWORD_HASH_SQL =
  "SELECT password_hash FROM users WHERE email = $1";

const ACTIVE_STAFF_SESSION_COUNT_SQL = [
  "SELECT count(*)::int AS active_sessions",
  "FROM staff_auth_sessions",
  "WHERE revoked_at IS NULL AND absolute_expires_at > clock_timestamp()",
].join(" ");

const ANTI_ABUSE_EVENT_COUNT_SQL =
  "SELECT count(*)::int AS event_count FROM anti_abuse_events";

export const STATUS_SQL_STATEMENTS = [
  DATABASE_IDENTITY_SQL,
  EMPLOYEE_IDENTITY_SQL,
  EMPLOYEE_LOCATION_ACCESS_SQL,
  EMPLOYEE_ACTIVE_SHIFT_SQL,
  EMPLOYEE_PASSWORD_HASH_SQL,
  ACTIVE_STAFF_SESSION_COUNT_SQL,
  ANTI_ABUSE_EVENT_COUNT_SQL,
  KEY_SLOT_OCCUPANCY_SQL,
  PARKING_SPOT_OCCUPANCY_SQL,
] as const;

export async function runReadOnly<T>(
  client: QueryableClient,
  action: (transaction: QueryableClient) => Promise<T>,
): Promise<T> {
  await client.query("BEGIN TRANSACTION READ ONLY");
  try {
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original status failure.
    }
    throw error;
  }
}

export interface StatusReport {
  readonly databaseName: string;
  readonly employee: {
    readonly activeShifts: number;
    readonly email: string;
    readonly exists: boolean;
    readonly locationCodes: string[];
    readonly membershipRole: string | null;
    readonly membershipStatus: string | null;
    readonly passwordVerifies: boolean;
    readonly userStatus: string | null;
  };
  readonly keySlotLines: string[];
  readonly parkingSpotLines: string[];
  readonly sessionCounts: {
    readonly activeStaffAuthSessions: number;
    readonly antiAbuseEvents: number;
  };
}

async function resolveEmployee(
  client: QueryableClient,
): Promise<StatusReport["employee"]> {
  const identity = await client.query(EMPLOYEE_IDENTITY_SQL, [
    LOCAL_SMOKE_EMPLOYEE_EMAIL,
  ]);
  if ((identity.rowCount ?? 0) !== 1 || identity.rows[0] === undefined) {
    return {
      activeShifts: 0,
      email: LOCAL_SMOKE_EMPLOYEE_EMAIL,
      exists: false,
      locationCodes: [],
      membershipRole: null,
      membershipStatus: null,
      passwordVerifies: false,
      userStatus: null,
    };
  }
  const row = identity.rows[0];
  const locations = await client.query(EMPLOYEE_LOCATION_ACCESS_SQL, [
    LOCAL_SMOKE_EMPLOYEE_EMAIL,
  ]);
  const shifts = await client.query(EMPLOYEE_ACTIVE_SHIFT_SQL, [
    LOCAL_SMOKE_EMPLOYEE_EMAIL,
  ]);
  const storedHash = await client.query(EMPLOYEE_PASSWORD_HASH_SQL, [
    LOCAL_SMOKE_EMPLOYEE_EMAIL,
  ]);
  const passwordHash =
    storedHash.rows[0]?.password_hash === undefined
      ? null
      : String(storedHash.rows[0].password_hash);
  const verifier = new Argon2StaffPasswordVerifier();
  return {
    activeShifts:
      shifts.rows[0]?.active_shifts === undefined
        ? 0
        : Number(shifts.rows[0].active_shifts),
    email: String(row.email),
    exists: true,
    locationCodes: locations.rows.map((entry) => String(entry.code)),
    membershipRole:
      row.membership_role === null ? null : String(row.membership_role),
    membershipStatus:
      row.membership_status === null ? null : String(row.membership_status),
    passwordVerifies:
      passwordHash === null
        ? false
        : await verifier.verify(passwordHash, LOCAL_SMOKE_EMPLOYEE_PASSWORD),
    userStatus: row.user_status === null ? null : String(row.user_status),
  };
}

export async function collectStatusReport(
  client: QueryableClient,
): Promise<StatusReport> {
  return runReadOnly(client, async (transaction) => {
    const database = await transaction.query(DATABASE_IDENTITY_SQL);
    const keySlots = classifyResourceRows(
      toResourceOccupancyRows(
        (await transaction.query(KEY_SLOT_OCCUPANCY_SQL)).rows,
      ),
    );
    const parkingSpots = classifyResourceRows(
      toResourceOccupancyRows(
        (await transaction.query(PARKING_SPOT_OCCUPANCY_SQL)).rows,
      ),
    );
    const sessions = await transaction.query(ACTIVE_STAFF_SESSION_COUNT_SQL);
    const antiAbuse = await transaction.query(ANTI_ABUSE_EVENT_COUNT_SQL);
    return {
      databaseName: String(database.rows[0]?.database_name ?? "(unknown)"),
      employee: await resolveEmployee(transaction),
      keySlotLines: formatOccupancyLines(keySlots),
      parkingSpotLines: formatOccupancyLines(parkingSpots),
      sessionCounts: {
        activeStaffAuthSessions: Number(sessions.rows[0]?.active_sessions ?? 0),
        antiAbuseEvents: Number(antiAbuse.rows[0]?.event_count ?? 0),
      },
    };
  });
}

export function renderStatusReport(report: StatusReport): string[] {
  const employee = report.employee;
  return [
    `VAYLET local status (${report.databaseName})`,
    "",
    `API:       ${LOCAL_SERVICE_URLS.api}`,
    `Employee:  ${LOCAL_SERVICE_URLS.employee}`,
    `Customer:  ${LOCAL_SERVICE_URLS.customer}`,
    "",
    "Demo employee:",
    `  exists:            ${employee.exists ? "YES" : "NO"}`,
    `  status:            ${employee.userStatus ?? "-"}`,
    `  email:             ${employee.email}`,
    `  membership role:   ${employee.membershipRole ?? "-"}`,
    `  membership status: ${employee.membershipStatus ?? "-"}`,
    `  locations:         ${
      employee.locationCodes.length > 0
        ? employee.locationCodes.join(", ")
        : "-"
    }`,
    `  active shifts:     ${employee.activeShifts}`,
    `  canonical password verifies: ${employee.passwordVerifies ? "YES" : "NO"}`,
    "",
    "KeySlots:",
    ...report.keySlotLines,
    "",
    "Parking spots:",
    ...report.parkingSpotLines,
    "",
    "Auth diagnostics:",
    `  active staff auth sessions: ${report.sessionCounts.activeStaffAuthSessions}`,
    `  anti-abuse events:          ${report.sessionCounts.antiAbuseEvents}`,
  ];
}

async function main(): Promise<void> {
  try {
    const environment = loadStatusEnvironment();
    const client = new Client({
      connectionString: environment.runtime.value,
    });
    await client.connect();
    try {
      const report = await collectStatusReport(client);
      for (const line of renderStatusReport(report)) {
        process.stdout.write(`${line}\n`);
      }
    } finally {
      await client.end();
    }
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith(join("local-dev", "status.ts"))) {
  void main();
}
