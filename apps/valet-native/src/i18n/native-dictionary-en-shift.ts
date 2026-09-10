/**
 * Employee Shift lifecycle copy (VUI-011A/VUI-011D): Start Shift, End Shift,
 * ambiguous-outcome recovery, cash reconciliation entry and elapsed-duration
 * unit labels. Split from the alphabetical base dictionary so each locale's
 * authored file stays within the repository structure limits (docs/17).
 */
export const nativeEmployeeEnglishShiftDictionary = {
  activeShiftLabel: "Active shift",
  cashAmountPlaceholder: "Enter cash amount",
  cashExpectedLabel: "Cash expected",
  cashReportedHelper: "Cash physically held at the end of this shift.",
  cashReportedLabel: "Cash reported",
  cashReportedValidation:
    "Enter a valid non-negative cash amount using up to three decimal places.",
  cashVarianceLabel: "Variance",
  chooseLocationLabel: "Choose your shift location",
  confirmEndShift: "Confirm end shift",
  dismissAction: "Dismiss",
  durationDayShort: "d",
  durationHourShort: "h",
  durationMinuteShort: "m",
  elapsed: "Elapsed",
  endingShift: "Ending shift...",
  endShiftAction: "End Shift",
  endShiftConfirmMessage:
    "End this shift now? The reported cash amount is recorded permanently and this cannot be undone.",
  endShiftUncertain:
    "The connection dropped before the result was confirmed. Your shift may or may not have ended. Reconnect and retry the same end shift action; do not start assuming it succeeded.",
  endShiftUncertainTitle: "Confirm your end shift result",
  noStartableLocationDetail:
    "No startable location is available for your account right now.",
  openWorkBlocksEndShift:
    "Open work must be handed over before the shift can end. Complete or hand over your assigned tasks first.",
  reviewAssignedTasks: "Review assigned tasks",
  retryEndShift: "Retry end shift",
  retryStartShift: "Retry start shift",
  shiftEndedTitle: "Shift ended",
  startShiftAction: "Start Shift",
  startShiftConflict:
    "You already have an active shift at a different location.",
  startShiftPrompt: "Start a shift to begin operational work.",
  startShiftUncertain:
    "The connection dropped before the result was confirmed. A shift may or may not have been started. Reconnect and retry the same start action; do not assume it succeeded.",
  startShiftUncertainTitle: "Confirm your start shift result",
  startedAtLabel: "Started",
  startingShift: "Starting shift...",
} as const;
