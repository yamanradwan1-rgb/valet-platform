export const mfaProtectedWriterTables = Object.freeze([
  "users",
  "organizations",
  "organization_memberships",
  "staff_auth_sessions",
  "user_mfa_totp_factors",
  "mfa_recovery_codes",
  "anti_abuse_events",
]);

// Direct SELECT inventory derived from the SQL used by the MFA ceremony
// services. No password hash, anti-abuse ledger or unrelated account fields.
export const mfaProtectedWriterSelectColumns = Object.freeze({
  users: ["id", "status"],
  organizations: ["id", "status"],
  organization_memberships: [
    "id",
    "organization_id",
    "user_id",
    "role",
    "status",
  ],
  staff_auth_sessions: [
    "id",
    "user_id",
    "absolute_expires_at",
    "mfa_authenticated_at",
    "mfa_factor_id",
    "last_admin_activity_at",
    "current_access_token_hash",
    "revoked_at",
    "access_expires_at",
  ],
  user_mfa_totp_factors: [
    "id",
    "user_id",
    "state",
    "protected_secret",
    "pending_enrollment_session_id",
    "last_accepted_step",
    "recovery_set_generation",
    "created_at",
    "activated_at",
    "retired_at",
  ],
  mfa_recovery_codes: [
    "id",
    "verifier",
    "factor_id",
    "set_generation",
    "selector",
    "consumed_at",
  ],
  anti_abuse_events: [],
});

export const mfaProtectedWriterFunctions = Object.freeze({
  quotaSuccess: "public.s04_mfa_success(uuid,text,text)",
  accountSecurityAudit:
    "public.append_runtime_account_security_audit_event(uuid,text,uuid,public.account_security_actor_type,uuid,timestamp with time zone)",
});

export const mfaProtectedWriterSessionUpdateColumns = Object.freeze([
  "mfa_authenticated_at",
  "mfa_factor_id",
  "last_admin_activity_at",
]);

export const mfaProtectedWriterUserLockColumn = "runtime_lock_version";
