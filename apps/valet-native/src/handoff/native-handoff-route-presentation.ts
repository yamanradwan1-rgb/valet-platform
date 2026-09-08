import type {
  EmployeeHandoffSnapshot,
  EmployeeReleaseSnapshot,
  EmployeeRetrievalSnapshot,
} from "@valet/employee-client";

export function shouldShowNativeHandoff(
  handoff: EmployeeHandoffSnapshot,
  retrieval: EmployeeRetrievalSnapshot,
  release: EmployeeReleaseSnapshot,
) {
  if (release.phase !== "inactive") return true;
  if (handoff.phase === "inactive") return false;
  if (handoff.phase === "loading") return retrieval.phase === "inactive";
  if (
    handoff.session?.state === "READY" ||
    handoff.session?.state === "HANDOFF_PENDING"
  ) {
    return true;
  }
  return (
    (handoff.phase === "ambiguous" || handoff.phase === "unavailable") &&
    ["inactive", "ready", "conflict"].includes(retrieval.phase)
  );
}
