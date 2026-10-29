import type { TaskOverviewEntry } from "@valet/contracts";

type TaskFacts = Pick<TaskOverviewEntry, "status" | "taskType">;
type ViewerRole = "COMPANY_ADMIN" | "LOCATION_MANAGER" | "SUPERVISOR";

/** Supervisor Tasks is limited to active Parking/Retrieval recovery work. */
export function supervisorEmergencyTaskVisible(task: TaskFacts): boolean {
  return task.status === "IN_PROGRESS" &&
    (task.taskType === "PARKING" || task.taskType === "RETRIEVAL");
}

/** Manager's ordinary task-read permission never grants emergency takeover. */
export function canOfferEmergencyTakeover(role: ViewerRole, task: TaskFacts): boolean {
  return (role === "COMPANY_ADMIN" || role === "SUPERVISOR") &&
    supervisorEmergencyTaskVisible(task);
}
