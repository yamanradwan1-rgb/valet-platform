export const staffAuthOperationRoutes: ReadonlyArray<{
  method: string;
  operation: string;
  path: RegExp;
}> = [
  {
    method: "POST",
    operation: "STAFF_AUTH_ACTIVATE",
    path: /^\/v1\/staff\/auth\/activate$/,
  },
  {
    method: "POST",
    operation: "STAFF_AUTH_LOGIN",
    path: /^\/v1\/staff\/auth\/login$/,
  },
  {
    method: "POST",
    operation: "STAFF_AUTH_REFRESH",
    path: /^\/v1\/staff\/auth\/refresh$/,
  },
  {
    method: "POST",
    operation: "STAFF_AUTH_LOGOUT",
    path: /^\/v1\/staff\/auth\/logout$/,
  },
  {
    method: "POST",
    operation: "STAFF_AUTH_NATIVE_LOGIN",
    path: /^\/v1\/staff\/auth\/native\/login$/,
  },
  {
    method: "POST",
    operation: "STAFF_AUTH_NATIVE_REFRESH",
    path: /^\/v1\/staff\/auth\/native\/refresh$/,
  },
  {
    method: "POST",
    operation: "STAFF_AUTH_NATIVE_LOGOUT",
    path: /^\/v1\/staff\/auth\/native\/logout$/,
  },
  {
    method: "GET",
    operation: "STAFF_AUTH_MFA_STATE",
    path: /^\/v1\/staff\/auth\/mfa\/state$/,
  },
  {
    method: "POST",
    operation: "STAFF_AUTH_MFA_ENROLLMENT_BEGIN",
    path: /^\/v1\/staff\/auth\/mfa\/enrollment\/begin$/,
  },
  {
    method: "POST",
    operation: "STAFF_AUTH_MFA_ENROLLMENT_CONFIRM",
    path: /^\/v1\/staff\/auth\/mfa\/enrollment\/confirm$/,
  },
  {
    method: "POST",
    operation: "STAFF_AUTH_MFA_STEP_UP",
    path: /^\/v1\/staff\/auth\/mfa\/step-up$/,
  },
  {
    method: "POST",
    operation: "STAFF_AUTH_MFA_SELF_RECOVERY_BEGIN",
    path: /^\/v1\/staff\/auth\/mfa\/recovery\/begin$/,
  },
  {
    method: "POST",
    operation: "STAFF_AUTH_MFA_RECOVERY_CODES_REISSUE",
    path: /^\/v1\/staff\/auth\/mfa\/recovery-codes\/reissue$/,
  },
];
