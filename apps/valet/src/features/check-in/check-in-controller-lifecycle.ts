import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import {
  runConditionCompletionMutation,
  runQueueParkingTaskMutation,
  runStartParkingMutation,
} from "./check-in-mutations";
import type { CheckInState, StartParkingPayload } from "./check-in-types";

export interface CheckInLifecycleContext {
  readonly client: EmployeeApiClient;
  readonly getState: () => CheckInState;
  readonly update: (patch: Partial<CheckInState>) => void;
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function completeCheckInCondition(
  context: CheckInLifecycleContext,
  conditionNote?: string,
): Promise<void> {
  const state = context.getState();
  if (state.isSubmitting) return;
  if (!state.activeSession) {
    context.update({ step: "parking-task" });
    return;
  }
  context.update({ error: null, isSubmitting: true });
  try {
    const result = await runConditionCompletionMutation(
      context.client,
      state.activeSession,
      conditionNote,
    );
    context.update({
      activeSession: {
        ...state.activeSession,
        conditionCompletedAt: result.conditionCompletedAt,
        sessionVersion: result.sessionVersion,
        state: "AWAITING_PARKING",
      },
      isSubmitting: false,
      step: "parking-task",
    });
  } catch (error: unknown) {
    context.update({
      error: message(error, "Failed to complete condition."),
      isSubmitting: false,
    });
  }
}

export async function createCheckInParkingTask(
  context: CheckInLifecycleContext,
): Promise<void> {
  const state = context.getState();
  if (state.isSubmitting) return;
  if (!state.activeSession) {
    context.update({ error: "No active check-in session found." });
    return;
  }
  context.update({ error: null, isSubmitting: true });
  try {
    const result = await runQueueParkingTaskMutation(
      context.client,
      state.activeSession,
    );
    context.update({
      activeSession: {
        ...state.activeSession,
        parkingTaskId: result.taskId,
        parkingTaskVersion: result.version,
      },
      isSubmitting: false,
      step: "parking-task",
    });
  } catch (error: unknown) {
    context.update({
      error: message(error, "Failed to queue parking task."),
      isSubmitting: false,
    });
  }
}

export async function startCheckInParking(
  context: CheckInLifecycleContext,
  membershipId?: string | null,
): Promise<StartParkingPayload | null> {
  const state = context.getState();
  if (state.isSubmitting) return null;
  if (!state.activeSession) {
    context.update({ error: "No active check-in session found." });
    return null;
  }
  context.update({ error: null, isSubmitting: true });
  try {
    const payload = await runStartParkingMutation(
      context.client,
      state.activeSession,
      membershipId,
    );
    context.update({ isSubmitting: false });
    return payload;
  } catch (error: unknown) {
    context.update({
      error: message(error, "Failed to start parking."),
      isSubmitting: false,
    });
    return null;
  }
}
