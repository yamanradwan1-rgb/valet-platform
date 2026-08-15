export const paymentOperationRoutes = [
  {
    method: "POST",
    operation: "PAYMENT_VALIDATION_MUTATE",
    path: /^\/v1\/staff\/valet-sessions\/[^/]+\/payment\/validation$/,
  },
  {
    method: "PATCH",
    operation: "PAYMENT_MANAGER_TIP_UPDATE",
    path: /^\/v1\/staff\/valet-sessions\/[^/]+\/payment\/tip$/,
  },
  {
    method: "PATCH",
    operation: "PAYMENT_PAYER_CORRECT",
    path: /^\/v1\/staff\/valet-sessions\/[^/]+\/payment\/payer$/,
  },
  {
    method: "PATCH",
    operation: "PAYMENT_SERVICE_AMOUNT_CORRECT",
    path: /^\/v1\/staff\/valet-sessions\/[^/]+\/payment\/service-amount$/,
  },
  {
    method: "PATCH",
    operation: "PAYMENT_GUEST_TIP_UPDATE",
    path: /^\/v1\/guest\/payment\/tip$/,
  },
] as const;
