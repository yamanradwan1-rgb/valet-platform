import { CustodyStaffAuthorizationError } from "./custody-staff-authorizer";
import type { MembershipRole } from "./custody-staff-authorizer";
import type {
  SessionScopeRow,
  TaskRow,
} from "./staff-valet-session-queries";

export function authorizeSessionAccess(
  session: SessionScopeRow,
  tasks: TaskRow[],
  actorMembershipId: string,
  actorRole?: MembershipRole | undefined,
): void {
  const parkingTasks = tasks.filter((t) => t.task_type === "PARKING");
  const activeParkingTasks = parkingTasks.filter((t) =>
    ["QUEUED", "ASSIGNED", "ACCEPTED", "IN_PROGRESS"].includes(t.status),
  );
  const completedParkingTasks = parkingTasks.filter(
    (t) => t.status === "COMPLETED",
  );

  const retrievalTasks = tasks.filter((t) => t.task_type === "RETRIEVAL");
  const activeRetrievalTasks = retrievalTasks.filter((t) =>
    ["QUEUED", "ASSIGNED", "ACCEPTED", "IN_PROGRESS"].includes(t.status),
  );

  if (session.state === "CHECKING_IN") {
    if (session.checked_in_by_membership_id !== actorMembershipId) {
      throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
    }
    return;
  }

  if (session.state === "AWAITING_PARKING") {
    if (activeParkingTasks.length > 1) {
      throw new Error("Corrupted state: multiple active parking tasks.");
    }
    const task = activeParkingTasks[0];
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
    if (
      activeParkingTasks.length !== 1 ||
      activeParkingTasks[0]?.status !== "IN_PROGRESS"
    ) {
      throw new Error("Corrupted state: expected 1 in-progress parking task.");
    }
    if (activeParkingTasks[0].current_assignee_membership_id !== actorMembershipId) {
      throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
    }
    return;
  }

  if (session.state === "PARKED") {
    if (completedParkingTasks.length !== 1) {
      throw new Error("Corrupted state: expected 1 completed parking task.");
    }
    if (
      completedParkingTasks[0]?.current_assignee_membership_id !==
      actorMembershipId
    ) {
      throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
    }
    return;
  }

  if (session.state === "REQUESTED") {
    if (completedParkingTasks.length !== 1) {
      throw new Error("Corrupted state: expected 1 completed parking task.");
    }
    if (activeRetrievalTasks.length > 1) {
      throw new Error("Corrupted state: multiple active retrieval tasks.");
    }
    const retTask = activeRetrievalTasks[0];
    const isParkingOwner =
      completedParkingTasks[0]?.current_assignee_membership_id ===
      actorMembershipId;

    if (retTask) {
      if (retTask.status === "IN_PROGRESS") {
        throw new Error(
          "Corrupted state: in-progress retrieval task in REQUESTED state.",
        );
      }
      if (
        retTask.current_assignee_membership_id === actorMembershipId ||
        isParkingOwner
      ) {
        return;
      }
      throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
    }

    if (isParkingOwner) return;
    throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
  }

  if (session.state === "RETRIEVING" || session.state === "READY") {
    if (completedParkingTasks.length !== 1) {
      throw new Error("Corrupted state: expected 1 completed parking task.");
    }
    if (
      activeRetrievalTasks.length !== 1 ||
      activeRetrievalTasks[0]?.status !== "IN_PROGRESS"
    ) {
      throw new Error("Corrupted state: expected 1 in-progress retrieval task.");
    }
    if (
      activeRetrievalTasks[0].current_assignee_membership_id !== actorMembershipId
    ) {
      throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
    }
    return;
  }

  if (session.state === "HANDOFF_PENDING") {
    // Canonical post-retrieval ownership is the RETRIEVAL Task; parking
    // ownership grants no read authority once retrieval custody began. The
    // narrow supervisor read supports only the accepted override UX.
    if (
      activeRetrievalTasks.length !== 1 ||
      activeRetrievalTasks[0]?.status !== "IN_PROGRESS"
    ) {
      throw new Error(
        "Corrupted state: expected 1 in-progress retrieval task.",
      );
    }
    if (completedParkingTasks.length !== 1) {
      throw new Error("Corrupted state: expected 1 completed parking task.");
    }
    if (
      activeRetrievalTasks[0].current_assignee_membership_id ===
        actorMembershipId ||
      actorRole === "VALET_SUPERVISOR"
    ) {
      return;
    }
    throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
  }

  if (session.state === "COMPLETED") {
    const completedRetrievalTasks = retrievalTasks.filter(
      (t) => t.status === "COMPLETED",
    );
    if (completedRetrievalTasks.length !== 1) {
      throw new Error("Corrupted state: expected 1 completed retrieval task.");
    }
    if (
      completedRetrievalTasks[0]?.current_assignee_membership_id ===
      actorMembershipId
    ) {
      return;
    }
    throw new CustodyStaffAuthorizationError("TENANT_ACCESS_DENIED");
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

  if (session.state === "PARKED" || session.state === "REQUESTED") {
    if (
      session.parking_started_at === null ||
      session.parked_at === null ||
      session.parking_spot_id === null ||
      session.parking_zone_id === null
    ) {
      throw new Error("Corrupted state: invalid post-parking state.");
    }
  }

  if (session.state === "RETRIEVING" || session.state === "READY") {
    if (
      session.parking_started_at === null ||
      session.parked_at === null ||
      session.parking_spot_id !== null
    ) {
      throw new Error("Corrupted state: invalid retrieving/ready state.");
    }
  }

  if (session.state === "HANDOFF_PENDING" || session.state === "COMPLETED") {
    if (
      session.parking_started_at === null ||
      session.parked_at === null
    ) {
      throw new Error("Corrupted state: invalid handoff/completed state.");
    }
  }
}
