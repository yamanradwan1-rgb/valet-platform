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
      let initialStep: RetrievalFlowStep = "key-checkout";
      if (initialSession.state === "RETRIEVING") initialStep = "in-progress";
      else if (initialSession.state === "READY") initialStep = "vehicle-ready";
      this.state = {
        activeSession: initialSession,
        error: null,
        isHydrating: false,
        isSubmitting: false,
        step: initialStep,
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
    let initialStep: RetrievalFlowStep = "key-checkout";
    if (session.state === "RETRIEVING") initialStep = "in-progress";
    else if (session.state === "READY") initialStep = "vehicle-ready";

    this.update({
      activeSession: session,
      error: null,
      isHydrating: false,
      isSubmitting: false,
      step: initialStep,
    });
  }

  async hydrateSession(
    sessionId: string,
    taskId: string,
    taskVersion: number,
  ): Promise<void> {
    this.update({ error: null, isHydrating: true });
    try {
      const detail = await fetchSessionDetail(this.apiClient, sessionId);

      if (
        detail.state !== "REQUESTED" &&
        detail.state !== "RETRIEVING" &&
        detail.state !== "READY"
      ) {
        throw new Error(
          `Session is in state ${detail.state}, which cannot be retrieved.`,
        );
      }

      let step: RetrievalFlowStep = "key-checkout";
      let taskStatus: "ACCEPTED" | "IN_PROGRESS" = "ACCEPTED";

      if (detail.state === "RETRIEVING") {
        step = "in-progress";
        taskStatus = "IN_PROGRESS";
      } else if (detail.state === "READY") {
        step = "vehicle-ready";
        taskStatus = "IN_PROGRESS";
      }

      const activeSession: ActiveRetrievalSession = {
        expectedKeySlotCode: detail.keySlot?.code ?? null,
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
        step,
      });
    } catch (err: unknown) {
      this.update({
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
      activeSession: {
        ...session,
        isKeyConfirmed: isMatch,
      },
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
        this.apiClient,
        session.sessionId,
        session.sessionVersion,
        session.taskVersion,
      );

      this.update({
        activeSession: {
          ...session,
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
      this.update({
        error: getErrMsg(err, "Failed to start retrieval."),
        isSubmitting: false,
      });
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
        this.apiClient,
        session.sessionId,
        session.sessionVersion,
      );

      this.update({
        activeSession: {
          ...session,
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
      this.update({
        error: getErrMsg(err, "Failed to mark vehicle ready."),
        isSubmitting: false,
      });
    }
  }
}
