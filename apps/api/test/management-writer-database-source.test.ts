import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("management writer database bootstrap SQL", () => {
  it("uses a non-reserved pg_auth_members alias", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/modules/management/management-writer-database.module.ts",
      ),
      "utf8",
    );
    expect(source).toContain("FROM pg_auth_members AS membership");
    expect(source).toContain("WHERE membership.member=role.oid");
    expect(source).not.toContain("FROM pg_auth_members AS grant");
  });

  it("keeps session authorization inside the five protected Management wrappers", () => {
    const root = resolve(process.cwd(), "../..");
    const read = (path: string) => readFileSync(resolve(root, path), "utf8");
    const preflight = read(
      "apps/api/src/modules/management/staff-management-authorization.ts",
    );
    const managementAuthorization = read(
      "apps/api/src/modules/management/management-authorization.ts",
    );
    const currentRoleStart = preflight.indexOf("async function currentRole");
    const currentRoleEnd = preflight.indexOf(
      "async function authorizeLocationManager",
      currentRoleStart,
    );
    expect(currentRoleStart).toBeGreaterThanOrEqual(0);
    expect(currentRoleEnd).toBeGreaterThan(currentRoleStart);
    const currentRole = preflight.slice(currentRoleStart, currentRoleEnd);
    expect(currentRole).toContain("!preflightOnly &&");
    expect(currentRole).toContain(
      'lockStaffSessionWithBearer(transaction, context, "EXCLUSIVE")',
    );
    const preflightQueryStart = currentRole.indexOf(
      "const result = await transaction.query<RoleRow>",
    );
    const preflightQueryEnd = currentRole.indexOf(
      "return result.rows[0]?.role",
    );
    expect(preflightQueryStart).toBeGreaterThanOrEqual(0);
    expect(preflightQueryEnd).toBeGreaterThan(preflightQueryStart);
    const preflightQuery = currentRole.slice(
      preflightQueryStart,
      preflightQueryEnd,
    );
    expect(preflightQuery).not.toMatch(
      /staff_auth_sessions|current_access_token_hash|created_at|FOR UPDATE|FOR SHARE|pg_advisory_xact_lock/,
    );
    const preflightBranch = preflight.slice(
      preflight.indexOf("export function authorizeStaffManagementPreflight"),
      preflight.indexOf("export async function authorizeStaffTarget"),
    );
    expect(preflightBranch).toContain(
      "resolveStaffManagementAuthority(transaction, context, input, true)",
    );
    expect(preflight).toContain("if (!preflightOnly)");
    expect(preflight).toContain(
      '${preflightOnly ? "" : "FOR UPDATE OF membership"}',
    );
    expect(preflight).toContain(
      '${preflightOnly ? "" : "FOR SHARE OF location"}',
    );
    expect(managementAuthorization).toContain("if (requireSessionAssurance)");
    expect(managementAuthorization).toContain(
      '${requireSessionAssurance ? "FOR UPDATE OF membership" : ""}',
    );
    expect(managementAuthorization).toContain(
      '${requireSessionAssurance ? "FOR UPDATE" : ""}',
    );

    const service = read(
      "apps/api/src/modules/management/staff-management-mutation.service.ts",
    );
    const repository = read(
      "apps/api/src/modules/management/staff-management-mutation-repository.ts",
    );
    const onboarding = read(
      "apps/api/src/modules/management/staff-onboarding-repository.ts",
    );
    const onboardingService = read(
      "apps/api/src/modules/management/staff-onboarding.service.ts",
    );
    const commandContext = read(
      "apps/api/src/modules/management/management-command-context.ts",
    );
    const functionInventory = read(
      "packages/database/scripts/management-writer-function-inventory.mjs",
    );
    expect(service.match(/authorizeStaffManagementPreflight\(/g)).toHaveLength(
      3,
    );
    expect(service).not.toContain(
      "authorizeStaffTarget(transaction, actor, membershipId, true)",
    );
    expect(
      onboardingService.match(/authorizeStaffManagementPreflight\(/g),
    ).toHaveLength(1);
    expect(onboardingService).not.toContain("authorizeStaffManagement(");
    expect(onboardingService).not.toContain("lockStaffOnboardingAccount");
    expect(onboardingService).not.toContain("lockStaffUserSecurityBoundary");
    expect(repository.match(/context\.rawAccessToken/g)).toHaveLength(3);
    expect(onboarding.match(/context\.rawAccessToken/g)).toHaveLength(2);
    expect(onboarding.match(/input\.actorMembershipId/g)).toHaveLength(2);
    expect(commandContext).toContain(
      "rawAccessToken: requireManagementBearer(authorization)",
    );
    expect(
      functionInventory.match(/"public\.staff_management_authorized_[^"]+"/g),
    ).toHaveLength(5);
    expect(repository).toContain("staff_management_authorized_set_role");
    expect(repository).toContain("staff_management_authorized_set_status");
    expect(repository).toContain(
      "staff_management_authorized_set_location_access",
    );
    expect(onboarding).toContain(
      "staff_management_authorized_onboarding_create",
    );
    expect(onboarding).toContain(
      "staff_management_authorized_onboarding_resend",
    );
  });

  it("provisions no direct Management Writer session or preflight DML authority", () => {
    const root = resolve(process.cwd(), "../..");
    const privileges = readFileSync(
      resolve(
        root,
        "packages/database/scripts/management-writer-privileges.mjs",
      ),
      "utf8",
    );
    const mutationInventory = readFileSync(
      resolve(
        root,
        "packages/database/scripts/management-writer-mutation-inventory.mjs",
      ),
      "utf8",
    );
    const forbiddenColumns = readFileSync(
      resolve(
        root,
        "packages/database/scripts/management-writer-forbidden-column-privileges.mjs",
      ),
      "utf8",
    );
    const aclCutover = readFileSync(
      resolve(
        root,
        "packages/database/scripts/option-c-protected-cutover-acl.mjs",
      ),
      "utf8",
    );
    const aclVerification = readFileSync(
      resolve(
        root,
        "packages/database/scripts/option-c-protected-cutover-acl-verification.mjs",
      ),
      "utf8",
    );
    const readiness = readFileSync(
      resolve(
        root,
        "packages/database/scripts/option-c-protected-cutover-readiness.mjs",
      ),
      "utf8",
    );
    expect(privileges).toContain("staff_auth_sessions: []");
    expect(privileges).toContain("staff_onboarding_invitations: []");
    expect(privileges).toContain("user_mfa_totp_factors: []");
    expect(privileges).toContain('users: ["id", "status", "email"]');
    expect(privileges).not.toContain("password_hash");
    expect(privileges).not.toContain("GRANT UPDATE");
    expect(privileges).toContain(
      "verifyManagementWriterForbiddenColumnPrivileges(client, role)",
    );
    expect(forbiddenColumns).toContain(
      '["staff_auth_sessions", "current_access_token_hash", "SELECT"]',
    );
    expect(forbiddenColumns).toContain(
      '["staff_auth_sessions", "last_admin_activity_at", "UPDATE"]',
    );
    expect(forbiddenColumns).toContain(
      "relation.relname='staff_auth_sessions'",
    );
    expect(forbiddenColumns).toContain("has_column_privilege(");
    expect(forbiddenColumns).toContain(
      '["organization_memberships", "updated_at", "UPDATE"]',
    );
    expect(forbiddenColumns).toContain('["locations", "updated_at", "UPDATE"]');
    expect(forbiddenColumns).toContain('["users", "updated_at", "UPDATE"]');
    expect(mutationInventory).not.toContain("attribute.attname='updated_at'");
    expect(aclCutover).toContain(
      'export { verifyOptionCProtectedAcl } from "./option-c-protected-cutover-acl-verification.mjs"',
    );
    expect(aclVerification).toContain("await verifyManagementWriterPrivileges");
    expect(readiness).toContain("await verifyManagementWriterPrivileges");
  });
});
