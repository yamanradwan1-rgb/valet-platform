export const staffOnboardingOperationRoutes: ReadonlyArray<{
  method: string;
  operation: string;
  path: RegExp;
}> = [
  {
    method: "POST",
    operation: "STAFF_ONBOARDING_CREATE",
    path: /^\/v1\/staff\/management\/organizations\/[^/]+\/staff$/,
  },
  {
    method: "POST",
    operation: "STAFF_ONBOARDING_RESEND",
    path: /^\/v1\/staff\/management\/organizations\/[^/]+\/staff\/[^/]+\/invitations$/,
  },
];
