/** Exact, bounded telemetry classification; identifiers never enter operation names. */
export const conditionPhotoOperationRoutes = [
  {
    method: "POST",
    operation: "CHECK_IN_CONDITION_PHOTO_UPLOAD",
    path: /^\/v1\/staff\/check-in\/sessions\/[^/]+\/condition-photo-uploads$/,
  },
  {
    method: "GET",
    operation: "CHECK_IN_CONDITION_PHOTO_STATUS",
    path: /^\/v1\/staff\/check-in\/sessions\/[^/]+\/condition-photo-uploads\/[^/]+$/,
  },
  {
    method: "POST",
    operation: "CHECK_IN_CONDITION_PHOTO_RECONCILE",
    path: /^\/v1\/staff\/check-in\/sessions\/[^/]+\/condition-photo-uploads\/[^/]+\/reconcile$/,
  },
  {
    method: "GET",
    operation: "CHECK_IN_CONDITION_PHOTO_STATE",
    path: /^\/v1\/staff\/check-in\/sessions\/[^/]+\/condition-photo-state$/,
  },
] as const;
