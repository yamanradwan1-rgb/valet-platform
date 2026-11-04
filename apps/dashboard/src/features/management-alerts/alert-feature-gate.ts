/** Release switch; absence always leaves the frozen Dashboard unchanged. */
export const managementAlertsEnabled =
  process.env.NEXT_PUBLIC_MANAGEMENT_ALERTS_PHASE1 === "enabled";
