export const webPushOperationRoutes = [
  {
    method: "POST",
    operation: "WEB_PUSH_SUBSCRIBE",
    path: /^\/v1\/(?:staff|guest)\/web-push\/subscriptions$/,
  },
  {
    method: "PUT",
    operation: "WEB_PUSH_REPLACE",
    path: /^\/v1\/(?:staff|guest)\/web-push\/subscriptions\/[^/]+$/,
  },
  {
    method: "DELETE",
    operation: "WEB_PUSH_UNSUBSCRIBE",
    path: /^\/v1\/(?:staff|guest)\/web-push\/subscriptions\/[^/]+$/,
  },
] as const;
