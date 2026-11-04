/** Release switch; absence always leaves the frozen Dashboard unchanged. */
export const managementAlertsEnabled =
  process.env.NEXT_PUBLIC_MANAGEMENT_ALERTS_PHASE1 === "enabled";

/** Additional P2/P3 gate; when OFF, only the old five-category view is used. */
export const managementAlertsPhase23Enabled =
  managementAlertsEnabled &&
  process.env.NEXT_PUBLIC_MANAGEMENT_ALERTS_PHASE23 === "enabled";
