export type Screen =
  | "shift-start"
  | "task-queue"
  | "check-in"
  | "parking"
  | "retrieval"
  | "incident"
  | "guest-access"
  | "vehicles-list"
  | "scan-hub"
  | "shift-summary";

export type Tab = "home" | "vehicles" | "scan" | "shift";

export type BadgeVariant =
  | "checkin"
  | "parking"
  | "retrieval"
  | "handoff"
  | "incident"
  | "queued"
  | "active"
  | "parked"
  | "requested"
  | "ready"
  | "completed";

// DEC-068 §5/§23: the normal Check-In flow has no key-scan/key-assigned
// steps; a completed condition leads directly to the parking-task step.
export type CheckInStep =
  | "plate-scan"
  | "plate-confirm"
  | "manual-plate"
  | "customer-phone"
  | "vehicle-condition"
  | "parking-task";

export type ParkingStep = "in-progress" | "spot-scan" | "success";

export type RetrievalStep =
  | "task"
  | "key-checkout"
  | "wrong-key"
  | "in-progress"
  | "vehicle-ready"
  | "handoff-pin"
  | "verification-failed"
  | "guest-verified"
  | "released";

export type IncidentStep = "type" | "details" | "submitted";
