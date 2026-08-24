import { hashProvisioningPassword } from "../staff-provisioning/provisioning-password";

export const LOCAL_SMOKE_EMPLOYEE_EMAIL = "valet@vaylet.demo.invalid";
export const LOCAL_SMOKE_EMPLOYEE_PASSWORD = "VayletPassword123!";

export const AMMAN_DEMO_LOCATION_CODE = "AMM-DEMO";
export const CANONICAL_SMOKE_ROLE = "VALET_EMPLOYEE";

export interface QueryableClient {
  query(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

export interface DemoEmployeeCredentialResult {
  readonly activeShift: true;
  readonly email: string;
  readonly locationCodes: string[];
  readonly membershipRole: typeof CANONICAL_SMOKE_ROLE;
}

const MEMBERSHIP_SQL = [
  "SELECT m.role AS role, m.status AS membership_status",
  "FROM organization_memberships m",
  "JOIN users u ON u.id = m.user_id",
  "WHERE u.email = $1",
].join(" ");

const LOCATION_ACCESS_SQL = [
  "SELECT DISTINCT l.code AS code",
  "FROM membership_location_access mla",
  "JOIN organization_memberships m ON m.id = mla.membership_id",
  "JOIN users u ON u.id = m.user_id",
  "JOIN locations l ON l.id = mla.location_id",
  "WHERE u.email = $1",
].join(" ");

const ACTIVE_SHIFT_SQL = [
  "SELECT s.status AS status",
  "FROM shifts s",
  "JOIN organization_memberships m ON m.id = s.membership_id",
  "JOIN users u ON u.id = m.user_id",
  "WHERE u.email = $1 AND s.status = 'ACTIVE'",
].join(" ");

function requireSingleRow(
  rows: Record<string, unknown>[],
  message: string,
): Record<string, unknown> {
  if (rows.length !== 1) {
    throw new Error(message);
  }
  return rows[0]!;
}

async function assertCanonicalMembership(
  client: QueryableClient,
  email: string,
): Promise<void> {
  const memberships = await client.query(MEMBERSHIP_SQL, [email]);
  const membership = requireSingleRow(
    memberships.rows,
    "Canonical demo employee must have exactly one OrganizationMembership.",
  );
  if (membership.role !== CANONICAL_SMOKE_ROLE) {
    throw new Error(
      `Canonical demo employee role must remain ${CANONICAL_SMOKE_ROLE}.`,
    );
  }
  if (membership.membership_status !== "ACTIVE") {
    throw new Error("Canonical demo employee membership must remain ACTIVE.");
  }
}

async function assertAmmanLocationAccess(
  client: QueryableClient,
  email: string,
): Promise<string[]> {
  const locations = await client.query(LOCATION_ACCESS_SQL, [email]);
  const codes = locations.rows.map((row) => String(row.code));
  if (!codes.includes(AMMAN_DEMO_LOCATION_CODE)) {
    throw new Error(
      `Canonical demo employee must retain access to ${AMMAN_DEMO_LOCATION_CODE}.`,
    );
  }
  return codes;
}

async function assertActiveShift(
  client: QueryableClient,
  email: string,
): Promise<void> {
  const shifts = await client.query(ACTIVE_SHIFT_SQL, [email]);
  if ((shifts.rowCount ?? 0) < 1) {
    throw new Error("Canonical demo employee must retain an active Shift.");
  }
}

export async function makeDemoEmployeeLoginCapable(
  client: QueryableClient,
  email: string,
  password: string,
): Promise<DemoEmployeeCredentialResult> {
  const passwordHash = await hashProvisioningPassword(password);
  const updated = await client.query(
    "UPDATE users SET password_hash = $1 WHERE email = $2 AND status = 'ACTIVE'",
    [passwordHash, email],
  );
  if ((updated.rowCount ?? 0) !== 1) {
    throw new Error(
      "Canonical demo employee account was not found or is not ACTIVE.",
    );
  }
  await assertCanonicalMembership(client, email);
  const locationCodes = await assertAmmanLocationAccess(client, email);
  await assertActiveShift(client, email);
  return {
    activeShift: true,
    email,
    locationCodes,
    membershipRole: CANONICAL_SMOKE_ROLE,
  };
}
