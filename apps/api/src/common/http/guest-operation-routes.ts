export const guestOperationRoutes = [
  { method: "GET", operation: "GUEST_SESSION_READ", path: /^\/v1\/guest\/session$/ },
  {
    method: "POST",
    operation: "GUEST_BROWSER_SESSION_ENROLL",
    path: /^\/v1\/guest\/browser-session\/enroll$/,
  },
  {
    method: "POST",
    operation: "GUEST_BROWSER_SESSION_EXCHANGE",
    path: /^\/v1\/guest\/browser-session\/exchange$/,
  },
  {
    method: "POST",
    operation: "GUEST_BROWSER_SESSION_END",
    path: /^\/v1\/guest\/browser-session\/end$/,
  },
  {
    method: "POST",
    operation: "GUEST_RATING_SUBMIT",
    path: /^\/v1\/guest\/session\/rating$/,
  },
  {
    method: "GET",
    operation: "PAYMENT_GUEST_PROJECTION_READ",
    path: /^\/v1\/guest\/valet-sessions\/[^/]+\/payment$/,
  },
  {
    method: "POST",
    operation: "GUEST_RETRIEVAL_REQUEST",
    path: /^\/v1\/guest\/session\/request-retrieval$/,
  },
  {
    method: "POST",
    operation: "GUEST_RETRIEVAL_CANCEL",
    path: /^\/v1\/guest\/session\/cancel-retrieval$/,
  },
] as const;

export const guestAccessOperations = new Set([
  "CHECK_IN_GUEST_ACCESS_ISSUE",
  "CHECK_IN_GUEST_ACCESS_REVOKE",
  ...guestOperationRoutes.map((route) => route.operation),
  "PAYMENT_GUEST_TIP_UPDATE",
  "ISSUE_HANDOFF_VERIFICATION",
  "ROTATE_HANDOFF_VERIFICATION",
]);
