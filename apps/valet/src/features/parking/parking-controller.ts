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

export class ParkingController {
  private state: ParkingState = {
    activeSession: null,
    error: null,
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

  private update(patch: Partial<ParkingState>): void {
    this.state = { ...this.state, ...patch };
    this.onStateChange(this.state);
  }

  setStep(step: ParkingFlowStep): void {
    this.update({ error: null, step });
  }

  setActiveSession(session: ActiveParkingSession): void {
    this.update({
      activeSession: session,
      error: null,
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
    this.update({ error: null, isHydrating: true });
    try {
      const detail = await fetchSessionDetail(this.apiClient, sessionId);
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
      this.update({
        error: getErrMsg(err, "Failed to load parking session detail."),
        isHydrating: false,
      });
    }
  }

  async confirmParked(
    parkingSpotCode: string,
    keySlotCode: string,
  ): Promise<void> {
    if (this.state.isSubmitting) return;
    const session = this.state.activeSession;
    if (!session) {
      this.update({ error: "No active parking session found." });
      return;
    }

    this.update({ error: null, isSubmitting: true });
    try {
      const confirmRes = await confirmParkedSession(
        this.apiClient,
        session.sessionId,
        session.sessionVersion,
        session.taskVersion,
        parkingSpotCode,
        keySlotCode,
      );

      let authoritativeZone = session.parkingZoneCode;
      let authoritativeSpot = confirmRes.parkingSpotCode;

      try {
        const detail = await fetchSessionDetail(this.apiClient, session.sessionId);
        if (detail.parking.parkingZoneCode) authoritativeZone = detail.parking.parkingZoneCode;
        if (detail.parking.parkingSpotCode) authoritativeSpot = detail.parking.parkingSpotCode;
      } catch {
        // Fall back to returned spot code without fabricating zone
      }

      this.update({
        activeSession: {
          ...session,
          parkedAt: confirmRes.parkedAt,
          parkingSpotCode: authoritativeSpot,
          parkingZoneCode: authoritativeZone,
          sessionVersion: confirmRes.sessionVersion,
          taskVersion: confirmRes.taskVersion,
        },
        isSubmitting: false,
        step: "success",
      });
    } catch (err: unknown) {
      this.update({
        error: getErrMsg(err, "Failed to confirm parking."),
        isSubmitting: false,
      });
    }
  }
}
