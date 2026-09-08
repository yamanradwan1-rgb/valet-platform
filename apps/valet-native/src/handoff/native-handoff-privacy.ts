import { useEffect } from "react";
import { AppState } from "react-native";
import type { EmployeeHandoffSnapshot } from "@valet/employee-client";

type Clear = (value: string) => void;

export function useNativeHandoffPrivacy(
  snapshot: EmployeeHandoffSnapshot,
  setPickupCode: Clear,
  setQrProof: Clear,
  setAbortReason: Clear,
  setOverrideReason: Clear,
) {
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        setPickupCode("");
        setQrProof("");
      }
    });
    return () => subscription.remove();
  }, [setPickupCode, setQrProof]);

  useEffect(() => {
    setPickupCode("");
    setQrProof("");
    setAbortReason("");
    setOverrideReason("");
  }, [
    setAbortReason,
    setOverrideReason,
    setPickupCode,
    setQrProof,
    snapshot.identityGeneration,
    snapshot.scope?.organizationId,
    snapshot.scope?.locationId,
    snapshot.scope?.membershipId,
    snapshot.scope?.shiftId,
    snapshot.scope?.role,
    snapshot.task?.taskId,
    snapshot.task?.currentAssigneeMembershipId,
    snapshot.session?.sessionId,
  ]);

  useEffect(() => {
    if (snapshot.phase !== "pending") {
      setPickupCode("");
      setQrProof("");
    }
  }, [setPickupCode, setQrProof, snapshot.phase]);
}
