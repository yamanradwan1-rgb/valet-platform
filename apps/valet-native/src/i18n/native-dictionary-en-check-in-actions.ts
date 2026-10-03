export const nativeEmployeeEnglishCheckInActionsDictionary = {
  vehiclesIncompleteCheckIn:
    "This Check-In is incomplete. Continue it or cancel it if the vehicle will not be checked in.",
  vehiclesContinueCheckIn: "Continue Check-In",
  vehiclesCancelCheckIn: "Cancel Check-In",
  vehiclesCancelCheckInTitle: "Cancel this Check-In?",
  vehiclesCancelCheckInBody:
    "This ends the incomplete Check-In. Its history is retained. The vehicle will be removed from active Vehicles.",
  vehiclesKeepCheckIn: "Keep Check-In",
  vehiclesPreparingCheckIn: "Checking current Check-In…",
  vehiclesCancellingCheckIn: "Cancelling Check-In…",
  vehiclesCancelUnknown:
    "The outcome is not confirmed. Check the server before trying again.",
  vehiclesCheckCancelState: "Check server state",
  vehiclesRetryCancel: "Review cancellation again",
  vehiclesCheckInChanged:
    "The Check-In changed or access is no longer available. Refresh Vehicles.",
  vehiclesCheckInUnavailable:
    "The Check-In could not be opened. Refresh Vehicles and try again.",
  vehiclesCheckInCancelled: "Check-In cancelled.",
} as const;
