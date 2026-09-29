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
import {
  createActiveRetrievalSession,
  expectedRetrievalTaskStatus,
  retrievalErrorMessage,
  retrievalInitialStep,
} from "./retrieval-controller-state";

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
        step: retrievalInitialStep(initialSession.state),
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
      step: retrievalInitialStep(session.state),
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

      const expectedStatus = expectedRetrievalTaskStatus(detail.state);
      if (taskStatus !== expectedStatus) {
        throw new Error(
          `Task status ${taskStatus} is incompatible with ${detail.state} session state.`,
        );
      }

      const activeSession = createActiveRetrievalSession(
        detail,
        detail.state,
        taskId,
        taskVersion,
        taskStatus,
      );

      this.update({
        activeSession,
        isHydrating: false,
        step: retrievalInitialStep(detail.state),
      });
    } catch (err: unknown) {
      this.update({
        activeSession: null,
        error: retrievalErrorMessage(err, "Failed to load retrieval session detail."),
        isHydrating: false,
      });
    }
  }

  confirmKey(inputKeySlotCode: string, scannedKeySlotId: string | null = null): boolean {
    const session = this.state.activeSession;
    if (!session) return false;
    const expectedExact = session.expectedKeySlotCode?.trim() ?? "";
    const inputExact = inputKeySlotCode.trim();
    const isV2 = scannedKeySlotId !== null;
    const isMatch = isV2
      ? expectedExact !== "" &&
        expectedExact === inputExact &&
        session.expectedKeySlotId === scannedKeySlotId
      : expectedExact !== "" && expectedExact === inputExact;
    this.update({
      activeSession: {
        ...session,
        isKeyConfirmed: isMatch,
        verifiedKeySlotCode: isMatch && isV2 ? inputExact : null,
        verifiedKeySlotId: isMatch && isV2 ? scannedKeySlotId : null,
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
        {},
        typeof session.verifiedKeySlotId === "string" &&
        typeof session.verifiedKeySlotCode === "string"
          ? {
              keySlotCode: session.verifiedKeySlotCode,
              keySlotId: session.verifiedKeySlotId,
            }
          : undefined,
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
      this.update({ error: retrievalErrorMessage(err, "Failed to start retrieval."), isSubmitting: false });
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
      this.update({ error: retrievalErrorMessage(err, "Failed to mark vehicle ready."), isSubmitting: false });
    }
  }
}
