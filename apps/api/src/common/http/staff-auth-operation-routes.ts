export const staffAuthOperationRoutes: ReadonlyArray<{
  method: string;
  operation: string;
  path: RegExp;
}> = [
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
];
