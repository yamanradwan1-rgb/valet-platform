export interface HandoffOperationRoute {
  readonly method: string;
  readonly operation: string;
  readonly path: RegExp;
}

export const handoffOperationRoutes: readonly HandoffOperationRoute[] = [
  {
    method: "POST",
    operation: "ISSUE_HANDOFF_VERIFICATION",
    path: /^\/v1\/guest\/session\/handoff-verification\/issue$/,
  },
  {
    method: "POST",
    operation: "ROTATE_HANDOFF_VERIFICATION",
    path: /^\/v1\/guest\/session\/handoff-verification\/rotate$/,
  },
  {
    method: "POST",
    operation: "INITIATE_HANDOFF",
    path: /^\/v1\/staff\/valet-sessions\/[^/]+\/initiate-handoff$/,
  },
  {
    method: "POST",
    operation: "VERIFY_PICKUP_CODE",
    path: /^\/v1\/staff\/valet-sessions\/[^/]+\/verify-pickup-code$/,
  },
  {
    method: "POST",
    operation: "VERIFY_DYNAMIC_QR",
    path: /^\/v1\/staff\/valet-sessions\/[^/]+\/verify-dynamic-qr$/,
  },
  {
    method: "POST",
    operation: "SUPERVISOR_OVERRIDE_HANDOFF",
    path: /^\/v1\/staff\/valet-sessions\/[^/]+\/supervisor-override-handoff$/,
  },
  {
    method: "POST",
    operation: "ABORT_HANDOFF",
    path: /^\/v1\/staff\/valet-sessions\/[^/]+\/abort-handoff$/,
  },
];
