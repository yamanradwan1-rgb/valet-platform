import type {
  EmployeeShiftEndPhase,
  EmployeeShiftEndSnapshot,
  NativeAuthSnapshot,
} from "@valet/employee-client";

export function nativeShiftEndBackAction(
  phase: EmployeeShiftEndPhase,
): "allow" | "block" | "cancel-confirmation" {
  if (phase === "submitting") return "block";
  if (phase === "confirming") return "cancel-confirmation";
  return "allow";
}

export function shouldRenderDetachedShiftEnd(
  auth: NativeAuthSnapshot,
  snapshot: EmployeeShiftEndSnapshot,
  gateKind = "no-active-shift",
): boolean {
  const protectedRecovery = ["ended", "submitting", "uncertain"].includes(
    snapshot.phase,
  );
  const cleanupGate = [
    "access-denied",
    "no-active-shift",
    "no-usable-location",
  ].includes(gateKind);
  return (
    auth.phase === "authenticated" &&
    snapshot.identityGeneration === auth.authGeneration &&
    snapshot.authority !== null &&
    snapshot.phase !== "inactive" &&
    (protectedRecovery || cleanupGate)
  );
}
