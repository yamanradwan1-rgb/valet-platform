export const staffSessionLockOwner = "vaylet_staff_session_lock_owner";

export const staffSessionLockFunction =
  "public.staff_auth_lock_current_session(uuid,uuid,text,timestamp with time zone,text)";

export const staffSessionLockOwnerColumns = Object.freeze({
  staff_auth_sessions: {
    SELECT: [
      "id",
      "user_id",
      "created_at",
      "current_access_token_hash",
      "revoked_at",
      "access_expires_at",
      "absolute_expires_at",
      "mfa_authenticated_at",
      "mfa_factor_id",
      "last_admin_activity_at",
    ],
    UPDATE: ["runtime_lock_version"],
  },
  users: {
    SELECT: ["id", "status"],
    UPDATE: ["runtime_lock_version"],
  },
});

export const runtimeSessionSelectColumns = Object.freeze([
  "id",
  "user_id",
  "access_expires_at",
  "absolute_expires_at",
  "revoked_at",
  "created_at",
  "last_rotated_at",
  "mfa_authenticated_at",
  "mfa_factor_id",
  "last_admin_activity_at",
]);
