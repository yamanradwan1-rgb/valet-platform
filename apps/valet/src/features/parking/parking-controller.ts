import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import {
  confirmParkedSession,
  fetchSessionDetail,
} from "./parking-api";
import type {
  ActiveParkingSession,
  ParkingFlowStep,
  ParkingState,
} from "./parking-types";

function getErrMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function getErrCode(err: unknown): string | null {
  if (
    err !== null &&
    typeof err === "object" &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string"
  ) {
    return (err as { code: string }).code;
  }
  return null;
}

export class ParkingController {
  private operationVersion = 0;
  private active = true;

  private state: ParkingState = {
    activeSession: null,
    error: null,
    errorCode: null,
    isHydrating: false,
    isSubmitting: false,
    step: "in-progress",
  };

  constructor(
    private apiClient: EmployeeApiClient,
    private readonly onStateChange: (state: ParkingState) => void,
  ) {}

  setApiClient(client: EmployeeApiClient): void {
    this.apiClient = client;
  }

  getState(): ParkingState {
    return this.state;
  }

  activate(): void {
    this.active = true;
  }

  deactivate(): void {
    this.active = false;
    this.cancelPending();
  }

  cancelPending(): void {
    this.operationVersion += 1;
  }

  private isCurrent(version: number): boolean {
    return this.active && version === this.operationVersion;
  }

  private update(patch: Partial<ParkingState>): void {
    if (!this.active) return;
    this.state = { ...this.state, ...patch };
    this.onStateChange(this.state);
  }

  setStep(step: ParkingFlowStep): void {
    this.update({ error: null, step });
  }

  setActiveSession(session: ActiveParkingSession): void {
    if (!this.active) return;
    const current = this.state.activeSession;
    if (
      current?.sessionId === session.sessionId &&
      current.taskId === session.taskId
    ) {
      if (this.state.isHydrating) {
        this.cancelPending();
      }
      const sessionVersion = Math.max(current.sessionVersion, session.sessionVersion);
      const taskVersion = Math.max(current.taskVersion, session.taskVersion);
      if (
        this.state.isHydrating ||
        sessionVersion !== current.sessionVersion ||
        taskVersion !== current.taskVersion
      ) {
        this.update({
          activeSession: { ...current, sessionVersion, taskVersion },
          error: null,
          errorCode: null,
          isHydrating: false,
        });
      }
      return;
    }

    this.cancelPending();
    this.update({
      activeSession: session,
      error: null,
      errorCode: null,
      isHydrating: false,
      isSubmitting: false,
      step: "in-progress",
    });
  }

  clearSession(): void {
    if (!this.active) return;
    this.cancelPending();
    this.update({
      activeSession: null,
      error: null,
      errorCode: null,
      isHydrating: false,
      isSubmitting: false,
      step: "in-progress",
    });
  }

  async hydrateSession(
    sessionId: string,
    taskId: string,
    taskVersion: number,
  ): Promise<void> {
    if (!this.active) return;
    const version = ++this.operationVersion;
    const selected = this.state.activeSession;
    const sameTarget = selected?.sessionId === sessionId && selected.taskId === taskId;
    this.update({
      activeSession: sameTarget ? selected : null,
      error: null,
      errorCode: null,
      isHydrating: true,
      isSubmitting: false,
      step: sameTarget ? this.state.step : "in-progress",
    });
    try {
      const detail = await fetchSessionDetail(this.apiClient, sessionId);
      if (!this.isCurrent(version)) return;
      if (detail.state !== "PARKING" || !detail.parking.parkingStartedAt) {
        throw new Error("Session is not in active parking state.");
      }

      const activeSession: ActiveParkingSession = {
        keySlotCode: detail.keySlot?.code ?? null,
        locationId: detail.locationId,
        parkedAt: detail.parking.parkedAt,
        parkingSpotCode: detail.parking.parkingSpotCode,
        parkingStartedAt: detail.parking.parkingStartedAt,
        parkingZoneCode: detail.parking.parkingZoneCode,
        sessionId: detail.sessionId,
        sessionVersion: detail.version,
        taskId,
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
        step: "in-progress",
      });
    } catch (err: unknown) {
      if (!this.isCurrent(version)) return;
      this.update({
        error: getErrMsg(err, "Failed to load parking session detail."),
        errorCode: getErrCode(err),
        isHydrating: false,
      });
    }
  }

  async confirmParked(
    parkingSpotCode: string,
    keySlotCode: string,
    resourceIdentity: {
      readonly keySlotId?: string;
      readonly parkingSpotId?: string;
    } = {},
  ): Promise<void> {
    if (!this.active) return;
    if (this.state.isSubmitting || this.state.isHydrating) return;
    const session = this.state.activeSession;
    if (!session) {
      this.update({ error: "No active parking session found." });
      return;
    }

    const version = ++this.operationVersion;
    this.update({ error: null, errorCode: null, isHydrating: false, isSubmitting: true });
    try {
      const confirmRes = await confirmParkedSession(
        this.apiClient,
        session.sessionId,
        session.sessionVersion,
        session.taskVersion,
        parkingSpotCode,
        keySlotCode,
        {},
        resourceIdentity,
      );
      if (!this.isCurrent(version)) return;

      let authoritativeZone = session.parkingZoneCode;
      let authoritativeSpot = confirmRes.parkingSpotCode;
      // DEC-068 review fix: on the new path session.keySlotCode is still null
      // here even though the confirm just bound the submitted slot, so the
      // immediate fallback is the successfully submitted normalized code; the
      // authoritative detail refresh (when it succeeds) replaces it with the
      // server-returned value.
      let authoritativeKeySlot = keySlotCode.trim();

      try {
        const detail = await fetchSessionDetail(this.apiClient, session.sessionId);
        if (detail.parking.parkingZoneCode) authoritativeZone = detail.parking.parkingZoneCode;
        if (detail.parking.parkingSpotCode) authoritativeSpot = detail.parking.parkingSpotCode;
        if (detail.keySlot?.code) authoritativeKeySlot = detail.keySlot.code;
      } catch {
        // Keep the submitted slot code; never fabricate zone/slot detail.
      }
      if (!this.isCurrent(version)) return;

      const latest = this.state.activeSession;
      if (latest?.sessionId !== session.sessionId || latest.taskId !== session.taskId) {
        return;
      }
      this.update({
        activeSession: {
          ...latest,
          keySlotCode: authoritativeKeySlot,
          parkedAt: confirmRes.parkedAt,
          parkingSpotCode: authoritativeSpot,
          parkingZoneCode: authoritativeZone,
          sessionVersion: Math.max(latest.sessionVersion, confirmRes.sessionVersion),
          taskVersion: Math.max(latest.taskVersion, confirmRes.taskVersion),
        },
        isSubmitting: false,
        step: "success",
      });
    } catch (err: unknown) {
      if (!this.isCurrent(version)) return;
      this.update({
        error: getErrMsg(err, "Failed to confirm parking."),
        // DEC-068 §25: KEY_CUSTODY_NOT_READY covers occupied/lost-race slot
        // binding with zero side effects; the UI maps it to a localized
        // "scan another slot" retry hint.
        errorCode: getErrCode(err),
        isSubmitting: false,
      });
    }
  }
}
