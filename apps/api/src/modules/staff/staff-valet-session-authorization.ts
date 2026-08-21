import { CustodyStaffAuthorizationError } from "./custody-staff-authorizer";
import type {
  SessionScopeRow,
  TaskRow,
} from "./staff-valet-session-queries";

const postParkingStates = [
  "PARKED",
  "REQUESTED",
  "RETRIEVING",
  "READY",
  "HANDOFF_PENDING",
  "COMPLETED",
] as const;

export function authorizeSessionAccess(
  session: SessionScopeRow,
  tasks: TaskRow[],
  actorMembershipId: string,
): void {
  const activeTasks = tasks.filter((t) =>
    ["QUEUED", "ASSIGNED", "ACCEPTED", "IN_PROGRESS"].includes(t.status),
  );
  const completedTasks = tasks.filter((t) => t.status === "COMPLETED");

  if (session.state === "CHECKING_IN") {
    if (session.checked_in_by_membership_id !== actorMembershipId) {
      throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
    }
    return;
  }

  if (session.state === "AWAITING_PARKING") {
    if (activeTasks.length > 1) {
      throw new Error("Corrupted state: multiple active parking tasks.");
    }
    const task = activeTasks[0];
    if (!task) {
      if (session.checked_in_by_membership_id !== actorMembershipId) {
        throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
      }
      return;
    }
    if (task.status === "IN_PROGRESS") {
      throw new Error("Corrupted state: in-progress task in awaiting parking.");
    }
    if (task.status === "QUEUED") {
      return; // Authorized for any active on-shift employee.
    }
    if (task.current_assignee_membership_id !== actorMembershipId) {
      throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
    }
    return;
  }

  if (session.state === "PARKING") {
    if (activeTasks.length !== 1 || activeTasks[0]?.status !== "IN_PROGRESS") {
      throw new Error("Corrupted state: expected 1 in-progress parking task.");
    }
    if (activeTasks[0].current_assignee_membership_id !== actorMembershipId) {
      throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
    }
    return;
  }

  if (postParkingStates.includes(session.state as (typeof postParkingStates)[number])) {
    if (completedTasks.length !== 1) {
      throw new Error("Corrupted state: expected 1 completed parking task.");
    }
    if (
      completedTasks[0]?.current_assignee_membership_id !== actorMembershipId
    ) {
      throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
    }
    return;
  }

  throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
}

export function validateTemporalInvariants(session: SessionScopeRow): void {
  if (
    session.state !== "CHECKING_IN" &&
    session.check_in_condition_completed_at === null
  ) {
    throw new Error("Corrupted state: condition completion missing.");
  }
  if (session.state === "PARKING") {
    if (
      session.parking_started_at === null ||
      session.parked_at !== null ||
      session.parking_spot_id !== null
    ) {
      throw new Error("Corrupted state: invalid parking timestamps/spot.");
    }
  }
  if (postParkingStates.includes(session.state as (typeof postParkingStates)[number])) {
    if (
      session.parking_started_at === null ||
      session.parked_at === null ||
      session.parking_spot_id === null ||
      session.parking_zone_id === null
    ) {
      throw new Error("Corrupted state: invalid post-parking state.");
    }
  }
}
