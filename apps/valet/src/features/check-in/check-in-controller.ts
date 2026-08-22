import type {
  StaffCheckInContinuationSummary,
  StaffCheckInDraftSummary,
} from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { runCheckInDiscovery } from "./check-in-discovery";
import {
  hydrateContinuationSession,
  hydrateDraftSession,
} from "./check-in-hydration";
import {
  runConditionCompletionMutation,
  runIntakeMutation,
  runKeyAssignmentMutation,
  runQueueParkingTaskMutation,
  runStartParkingMutation,
  runUpdateVehicleIdentityMutation,
} from "./check-in-mutations";
import type {
  CheckInFlowStep,
  CheckInState,
  CheckInVehicleData,
  StartParkingPayload,
} from "./check-in-types";

function getErrMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export class CheckInController {
  private state: CheckInState = {
    activeSession: null,
    continuations: [],
    drafts: [],
    error: null,
    isHydrating: false,
    isSubmitting: false,
    pendingVehicle: null,
    step: "discovery",
  };

  constructor(
    private apiClient: EmployeeApiClient,
    private readonly onStateChange: (state: CheckInState) => void,
  ) {}

  setApiClient(client: EmployeeApiClient): void {
    this.apiClient = client;
  }

  getState(): CheckInState {
    return this.state;
  }

  private update(patch: Partial<CheckInState>): void {
    this.state = { ...this.state, ...patch };
    this.onStateChange(this.state);
  }

  setStep(step: CheckInFlowStep): void {
    if (
      this.state.activeSession?.state === "AWAITING_PARKING" &&
      (step === "plate-scan" ||
        step === "customer-phone" ||
        step === "vehicle-condition")
    ) {
      return;
    }
    this.update({ error: null, step });
  }

  async initialize(locationId: string): Promise<void> {
    this.update({ error: null, isHydrating: true, step: "discovery" });
    try {
      const outcome = await runCheckInDiscovery(this.apiClient, locationId);
      if (outcome.kind === "EMPTY") {
        this.update({ activeSession: null, continuations: [], drafts: [], isHydrating: false, step: "plate-scan" });
      } else if (outcome.kind === "MULTIPLE") {
        this.update({ activeSession: null, continuations: outcome.continuations, drafts: outcome.drafts, isHydrating: false, step: "multiple-recoverable" });
      } else if (outcome.kind === "SINGLE_DRAFT") {
        await this.hydrateFromDraft(locationId, outcome.draft);
      } else if (outcome.kind === "SINGLE_CONTINUATION") {
        await this.hydrateFromContinuation(locationId, outcome.continuation);
      }
    } catch (err: unknown) {
      this.update({ error: getErrMsg(err, "Failed to load check-in drafts."), isHydrating: false, step: "discovery-error" });
    }
  }

  async hydrateFromDraft(locationId: string, draft: StaffCheckInDraftSummary): Promise<void> {
    this.update({ error: null, isHydrating: true });
    try {
      const res = await hydrateDraftSession(this.apiClient, locationId, draft);
      this.update({ activeSession: res.activeSession, isHydrating: false, step: res.step });
    } catch (err: unknown) {
      this.update({ error: getErrMsg(err, "Failed to resume check-in draft."), isHydrating: false, step: "hydration-error" });
    }
  }

  async hydrateFromContinuation(locationId: string, continuation: StaffCheckInContinuationSummary): Promise<void> {
    this.update({ error: null, isHydrating: true });
    try {
      const res = await hydrateContinuationSession(this.apiClient, locationId, continuation);
      this.update({ activeSession: res.activeSession, isHydrating: false, step: res.step });
    } catch (err: unknown) {
      this.update({ error: getErrMsg(err, "Failed to resume check-in continuation."), isHydrating: false, step: "hydration-error" });
    }
  }

  async confirmPlate(vehicleData: CheckInVehicleData): Promise<void> {
    if (this.state.isSubmitting) return;
    const session = this.state.activeSession;
    if (session !== null) {
      if (session.state !== "CHECKING_IN") {
        this.update({
          error: "Vehicle identity cannot be modified after check-in is complete.",
        });
        return;
      }
      this.update({ error: null, isSubmitting: true });
      try {
        const res = await runUpdateVehicleIdentityMutation(this.apiClient, session, vehicleData);
        this.update({
          activeSession: { ...session, vehicle: res.vehicle, vehicleUpdatedAt: res.vehicleUpdatedAt },
          isSubmitting: false,
          step: "vehicle-condition",
        });
      } catch (err: unknown) {
        this.update({ error: getErrMsg(err, "Failed to update vehicle identity."), isSubmitting: false });
      }
      return;
    }

    this.update({ error: null, pendingVehicle: vehicleData, step: "customer-phone" });
  }

  async submitCustomerPhone(locationId: string, phone: string): Promise<void> {
    if (this.state.isSubmitting) return;
    const session = this.state.activeSession;
    if (session !== null) {
      this.update({ step: "vehicle-condition" });
      return;
    }

    const pending = this.state.pendingVehicle;
    if (!pending) {
      this.update({ error: "No vehicle captured.", step: "plate-scan" });
      return;
    }

    this.update({ error: null, isSubmitting: true });
    try {
      const activeSession = await runIntakeMutation(this.apiClient, locationId, pending, phone);
      this.update({ activeSession, isSubmitting: false, pendingVehicle: null, step: "vehicle-condition" });
    } catch (err: unknown) {
      this.update({ error: getErrMsg(err, "Failed to create vehicle intake."), isSubmitting: false });
    }
  }

  async completeCondition(conditionNote?: string): Promise<void> {
    if (this.state.isSubmitting) return;
    const session = this.state.activeSession;
    if (!session) {
      this.update({ step: "key-scan" });
      return;
    }

    this.update({ error: null, isSubmitting: true });
    try {
      const res = await runConditionCompletionMutation(this.apiClient, session, conditionNote);
      this.update({
        activeSession: { ...session, conditionCompletedAt: res.conditionCompletedAt, sessionVersion: res.sessionVersion, state: "AWAITING_PARKING" },
        isSubmitting: false,
        step: "key-scan",
      });
    } catch (err: unknown) {
      this.update({ error: getErrMsg(err, "Failed to complete condition."), isSubmitting: false });
    }
  }

  async assignKey(keySlotCode: string): Promise<void> {
    if (this.state.isSubmitting) return;
    const session = this.state.activeSession;
    if (!session) {
      this.update({ error: "No active check-in session found." });
      return;
    }

    this.update({ error: null, isSubmitting: true });
    try {
      const res = await runKeyAssignmentMutation(this.apiClient, session, keySlotCode);
      this.update({
        activeSession: { ...session, keySlotCode: res.keySlotCode, sessionVersion: res.sessionVersion },
        isSubmitting: false,
        step: "key-assigned",
      });
    } catch (err: unknown) {
      this.update({ error: getErrMsg(err, "Failed to assign key slot."), isSubmitting: false });
    }
  }

  async createParkingTask(): Promise<void> {
    if (this.state.isSubmitting) return;
    const session = this.state.activeSession;
    if (!session) {
      this.update({ error: "No active check-in session found." });
      return;
    }

    this.update({ error: null, isSubmitting: true });
    try {
      const res = await runQueueParkingTaskMutation(this.apiClient, session);
      this.update({
        activeSession: { ...session, parkingTaskId: res.taskId, parkingTaskVersion: res.version },
        isSubmitting: false,
        step: "parking-task",
      });
    } catch (err: unknown) {
      this.update({ error: getErrMsg(err, "Failed to queue parking task."), isSubmitting: false });
    }
  }

  async startParking(): Promise<StartParkingPayload | null> {
    if (this.state.isSubmitting) return null;
    const session = this.state.activeSession;
    if (!session) {
      this.update({ error: "No active check-in session found." });
      return null;
    }

    this.update({ error: null, isSubmitting: true });
    try {
      const payload = await runStartParkingMutation(this.apiClient, session);
      this.update({ isSubmitting: false });
      return payload;
    } catch (err: unknown) {
      this.update({ error: getErrMsg(err, "Failed to start parking."), isSubmitting: false });
      return null;
    }
  }
}
