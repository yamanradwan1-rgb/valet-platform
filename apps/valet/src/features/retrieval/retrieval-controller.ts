import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import {
  fetchSessionDetail,
  markReadySession,
  startRetrievalSession,
} from "./retrieval-api";
import type {
  ActiveRetrievalSession,
  RetrievalFlowStep,
  RetrievalState,
} from "./retrieval-types";

function getErrMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function resolveInitialStep(state?: string): RetrievalFlowStep {
  if (state === "RETRIEVING") return "in-progress";
  if (state === "READY") return "vehicle-ready";
  if (state === "HANDOFF_PENDING") return "handoff";
  if (state === "COMPLETED") return "handoff-completed";
  return "key-checkout";
}

const VALID_STATUS_MAP: Record<
  | "COMPLETED"
  | "READY"
  | "REQUESTED"
  | "RETRIEVING"
  | "HANDOFF_PENDING",
  "ACCEPTED" | "COMPLETED" | "IN_PROGRESS"
> = {
  COMPLETED: "COMPLETED",
  HANDOFF_PENDING: "IN_PROGRESS",
  READY: "IN_PROGRESS",
  REQUESTED: "ACCEPTED",
  RETRIEVING: "IN_PROGRESS",
};

export class RetrievalController {
  private membershipId: string | null = null;
  private state: RetrievalState = {
    activeSession: null,
    error: null,
    isHydrating: false,
    isSubmitting: false,
    step: "key-checkout",
  };

  constructor(
    private apiClient: EmployeeApiClient,
    private readonly onStateChange: (state: RetrievalState) => void,
    membershipId?: string | null,
    initialSession?: ActiveRetrievalSession | null,
  ) {
    this.membershipId = membershipId ?? null;
    if (initialSession) {
      this.state = {
        activeSession: initialSession,
        error: null,
        isHydrating: false,
        isSubmitting: false,
        step: resolveInitialStep(initialSession.state),
      };
    }
  }

  setApiClient(client: EmployeeApiClient): void {
    this.apiClient = client;
  }

  setMembershipId(membershipId?: string | null): void {
    this.membershipId = membershipId ?? null;
  }

  getState(): RetrievalState {
    return this.state;
  }

  private update(patch: Partial<RetrievalState>): void {
    this.state = { ...this.state, ...patch };
    this.onStateChange(this.state);
  }

  setStep(step: RetrievalFlowStep): void {
    this.update({ error: null, step });
  }

  setActiveSession(session: ActiveRetrievalSession): void {
    this.update({
      activeSession: session,
      error: null,
      isHydrating: false,
      isSubmitting: false,
      step: resolveInitialStep(session.state),
    });
  }

  setHydrationError(message: string): void {
    this.update({ activeSession: null, error: message, isHydrating: false });
  }

  async hydrateSession(
    sessionId: string,
    taskId: string,
    taskVersion: number,
    taskStatus: "ACCEPTED" | "IN_PROGRESS" | "COMPLETED",
    assigneeMembershipId: string,
    actorRole?: "VALET_SUPERVISOR" | undefined,
  ): Promise<void> {
    this.update({ error: null, isHydrating: true });
    try {
      if (!this.membershipId) throw new Error("No active staff membership.");
      if (!assigneeMembershipId && actorRole !== "VALET_SUPERVISOR") {
        throw new Error(
          "Retrieval task assignee metadata is missing; reload the task from the Task Queue.",
        );
      }
      if (!taskStatus) {
        throw new Error(
          "Retrieval task status metadata is missing; reload the task from the Task Queue.",
        );
      }
      // Same-user token refreshes must not look like ownership loss.
      const ownershipMatches =
        assigneeMembershipId === this.membershipId;
      if (!ownershipMatches && actorRole !== "VALET_SUPERVISOR") {
        throw new Error(
          "Retrieval task is assigned to another valet employee.",
        );
      }

      const detail = await fetchSessionDetail(this.apiClient, sessionId);
      if (
        detail.state !== "REQUESTED" &&
        detail.state !== "RETRIEVING" &&
        detail.state !== "READY" &&
        detail.state !== "HANDOFF_PENDING" &&
        detail.state !== "COMPLETED"
      ) {
        throw new Error(
          `Session is in state ${detail.state}, which cannot be retrieved.`,
        );
      }

      const expectedStatus = VALID_STATUS_MAP[detail.state];
      if (taskStatus !== expectedStatus) {
        throw new Error(
          `Task status ${taskStatus} is incompatible with ${detail.state} session state.`,
        );
      }

      const activeSession: ActiveRetrievalSession = {
        expectedKeySlotCode: detail.keySlot?.code ?? null,
        handoff: detail.handoff,
        isKeyConfirmed: false,
        locationId: detail.locationId,
        parkingSpotCode: detail.parking.parkingSpotCode,
        parkingZoneCode: detail.parking.parkingZoneCode,
        readyAt: null,
        retrievalStartedAt: null,
        sessionId: detail.sessionId,
        sessionVersion: detail.version,
        state: detail.state,
        taskId,
        taskStatus,
        taskVersion,
        vehicle: {
          color: detail.vehicle.color,
          make: detail.vehicle.make,
          model: detail.vehicle.model,
          plateCountry: detail.vehicle.plateCountry,
          plateNumberRaw: detail.vehicle.plateNumberRaw,
          temporaryDescriptor: detail.vehicle.temporaryDescriptor,
        },
      };

      this.update({
        activeSession,
        isHydrating: false,
        step: resolveInitialStep(detail.state),
      });
    } catch (err: unknown) {
      this.update({
        activeSession: null,
        error: getErrMsg(err, "Failed to load retrieval session detail."),
        isHydrating: false,
      });
    }
  }

  confirmKey(inputKeySlotCode: string): boolean {
    const session = this.state.activeSession;
    if (!session) return false;
    const expected = session.expectedKeySlotCode?.trim().toUpperCase() ?? "";
    const input = inputKeySlotCode.trim().toUpperCase();
    const isMatch = expected !== "" && expected === input;
    this.update({
      activeSession: { ...session, isKeyConfirmed: isMatch },
      error: isMatch ? null : "Key slot does not match expected key.",
    });
    return isMatch;
  }

  async startRetrieval(): Promise<void> {
    if (this.state.isSubmitting) return;
    const session = this.state.activeSession;
    if (!session) {
      this.update({ error: "No active retrieval session found." });
      return;
    }
    if (session.state !== "REQUESTED") {
      this.update({ error: "Session must be in REQUESTED state to start retrieval." });
      return;
    }
    if (!session.isKeyConfirmed) {
      this.update({ error: "Key slot must be verified before starting retrieval." });
      return;
    }

    this.update({ error: null, isSubmitting: true });
    try {
      const res = await startRetrievalSession(
        this.apiClient, session.sessionId, session.sessionVersion, session.taskVersion,
      );
      this.update({
        activeSession: {
          ...session,
          parkingSpotCode: null,
          parkingZoneCode: null,
          retrievalStartedAt: res.retrievalStartedAt,
          sessionVersion: res.sessionVersion,
          state: "RETRIEVING",
          taskStatus: res.taskStatus,
          taskVersion: res.taskVersion,
        },
        isSubmitting: false,
        step: "in-progress",
      });
    } catch (err: unknown) {
      this.update({ error: getErrMsg(err, "Failed to start retrieval."), isSubmitting: false });
    }
  }

  async markReady(): Promise<void> {
    if (this.state.isSubmitting) return;
    const session = this.state.activeSession;
    if (!session) {
      this.update({ error: "No active retrieval session found." });
      return;
    }
    if (session.state !== "RETRIEVING") {
      this.update({ error: "Session must be in RETRIEVING state to mark ready." });
      return;
    }

    this.update({ error: null, isSubmitting: true });
    try {
      const res = await markReadySession(
        this.apiClient, session.sessionId, session.sessionVersion,
      );
      this.update({
        activeSession: {
          ...session,
          parkingSpotCode: null,
          parkingZoneCode: null,
          readyAt: res.readyAt,
          sessionVersion: res.sessionVersion,
          state: "READY",
          taskStatus: res.taskStatus,
          taskVersion: res.taskVersion,
        },
        isSubmitting: false,
        step: "vehicle-ready",
      });
    } catch (err: unknown) {
      this.update({ error: getErrMsg(err, "Failed to mark vehicle ready."), isSubmitting: false });
    }
  }
}
