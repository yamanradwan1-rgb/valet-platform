/**
 * Context-aware Scan Hub copy (VUI-011B, DEC-066 §5): a launcher over
 * existing authoritative workflows only — no camera/scanner semantics.
 * Split from the alphabetical base dictionary so each locale's authored
 * file stays within the repository structure limits (docs/17).
 */
export const employeeEnglishScanHubDictionary = {
  scanHubKeySlotDisabled: "Open the vehicle workflow first.",
  scanHubLicensePlateSub: "Check in a new vehicle",
  scanHubParkingDisabled: "Open an active parking task first.",
  scanHubParkingResume: "Resume active parking",
  scanHubPickupLabel: "Pickup Handoff",
  scanHubRetrievalDisabled: "Open an active retrieval task first.",
  scanHubRetrievalResume: "Resume active retrieval",
  scanHubSubtitle: "Choose how to continue",
} as const;
