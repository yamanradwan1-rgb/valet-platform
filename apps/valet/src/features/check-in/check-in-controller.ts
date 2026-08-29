import type {
  StaffCheckInContinuationSummary,
  StaffCheckInDraftSummary,
} from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { normalizeJordanCustomerPhone } from "./check-in-customer-phone";
import {
  generateUuid,
  runUpdateVehicleIdentityMutation,
} from "./check-in-mutations";
import {
  completeCheckInCondition,
  createCheckInParkingTask,
  startCheckInParking,
  type CheckInLifecycleContext,
} from "./check-in-controller-lifecycle";
import {
  hydrateCheckInContinuation,
  hydrateCheckInDraft,
  initializeCheckIn,
} from "./check-in-controller-recovery";
import {
  continueResolvedCheckIn,
  createPreIntakeSession,
  recognizePreIntakeVehicle,
  setKnownVehicleCorrection,
  setVehicleDetailDraft,
  type ReturningCheckInActionContext,
} from "./check-in-returning-vehicle";
import type {
  CheckInFlowStep,
  CheckInState,
  CheckInVehicleData,
  CheckInVehicleDetailsDraft,
  StartParkingPayload,
} from "./check-in-types";

export class CheckInController {
  private membershipId: string | null = null;
  private pendingIntakeOperationId: string | null = null;
  private state: CheckInState = {
    activeSession: null,
    continuations: [],
    drafts: [],
    error: null,
    correctionConflict: false,
    customerOrigin: "plate-confirm",
    customerResolved: false,
    isHydrating: false,
    isSubmitting: false,
    pendingCorrection: null,
    pendingCorrectionExpectedAt: null,
    pendingVehicle: null,
    recognizedVehicle: null,
    recognitionFailed: false,
    step: "discovery",
  };

  constructor(
    private apiClient: EmployeeApiClient,
    private readonly onStateChange: (state: CheckInState) => void,
    membershipId?: string | null,
  ) {
    this.membershipId = membershipId ?? null;
  }

  setApiClient(client: EmployeeApiClient): void {
    this.apiClient = client;
  }

  setMembershipId(membershipId?: string | null): void {
    this.membershipId = membershipId ?? null;
  }

  getState(): CheckInState {
    return this.state;
  }

  private update(patch: Partial<CheckInState>): void {
    this.state = { ...this.state, ...patch };
    this.onStateChange(this.state);
  }

  private returningContext(): ReturningCheckInActionContext {
    return {
      client: this.apiClient,
      clearIntakeOperationId: () => {
        this.pendingIntakeOperationId = null;
      },
      getIntakeOperationId: () => this.nextIntakeOperationId(),
      getState: () => this.state,
      update: (patch) => this.update(patch),
    };
  }

  private lifecycleContext(): CheckInLifecycleContext {
    return {
      client: this.apiClient,
      getState: () => this.state,
      update: (patch) => this.update(patch),
    };
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
    this.pendingIntakeOperationId = null;
    await initializeCheckIn(this.lifecycleContext(), locationId);
  }

  async hydrateFromDraft(
    locationId: string,
    draft: StaffCheckInDraftSummary,
  ): Promise<void> {
    this.pendingIntakeOperationId = null;
    await hydrateCheckInDraft(this.lifecycleContext(), locationId, draft);
  }

  async hydrateFromContinuation(
    locationId: string,
    continuation: StaffCheckInContinuationSummary,
  ): Promise<void> {
    this.pendingIntakeOperationId = null;
    await hydrateCheckInContinuation(
      this.lifecycleContext(),
      locationId,
      continuation,
    );
  }

  async confirmPlate(
    locationIdOrVehicle: string | CheckInVehicleData,
    maybeVehicle?: CheckInVehicleData,
  ): Promise<void> {
    const locationId =
      typeof locationIdOrVehicle === "string" ? locationIdOrVehicle : null;
    const vehicleData =
      typeof locationIdOrVehicle === "string"
        ? maybeVehicle
        : locationIdOrVehicle;
    if (!vehicleData) return;
    if (this.state.isSubmitting) return;
    const session = this.state.activeSession;
    if (session !== null) {
      if (session.state !== "CHECKING_IN") {
        this.update({
          error:
            "Vehicle identity cannot be modified after check-in is complete.",
        });
        return;
      }
      this.update({ error: null, isSubmitting: true });
      try {
        const res = await runUpdateVehicleIdentityMutation(
          this.apiClient,
          session,
          vehicleData,
        );
        this.update({
          activeSession: {
            ...session,
            vehicle: res.vehicle,
            vehicleUpdatedAt: res.vehicleUpdatedAt,
          },
          isSubmitting: false,
          step: "vehicle-condition",
        });
      } catch (err: unknown) {
        this.update({
          error:
            err instanceof Error
              ? err.message
              : "Failed to update vehicle identity.",
          isSubmitting: false,
        });
      }
      return;
    }

    if (!locationId) {
      this.update({
        error: "Missing target location for vehicle recognition.",
      });
      return;
    }

    await recognizePreIntakeVehicle(
      this.returningContext(),
      locationId,
      vehicleData,
    );
  }

  /**
   * One logical intake = one stable intakeOperationId, reused across
   * lost-response retries until authoritative success or a genuinely new
   * vehicle capture replaces the pending flow.
   */
  private nextIntakeOperationId(): string {
    if (this.pendingIntakeOperationId === null) {
      this.pendingIntakeOperationId = generateUuid();
    }
    return this.pendingIntakeOperationId;
  }

  continueWithoutRecognition(): void {
    this.update({
      customerOrigin: "plate-confirm",
      error: null,
      recognitionFailed: false,
      step: "customer-phone",
    });
  }

  continueToCustomer(origin: "returning-vehicle" | "vehicle-details"): void {
    this.update({
      customerOrigin: origin,
      error: null,
      step: "customer-phone",
    });
  }

  setVehicleDetails(
    details: CheckInVehicleDetailsDraft,
    temporaryDescriptor?: string,
  ): void {
    setVehicleDetailDraft(
      this.returningContext(),
      details,
      temporaryDescriptor,
    );
  }

  setPendingCorrection(details: CheckInVehicleDetailsDraft): void {
    setKnownVehicleCorrection(this.returningContext(), details);
  }

  async useSavedCustomer(locationId: string): Promise<void> {
    const customer = this.state.recognizedVehicle?.returningCustomer;
    if (!customer) return;
    await createPreIntakeSession(this.returningContext(), locationId, {
      customerId: customer.customerId,
      intent: "USE_SAVED_CUSTOMER",
    });
  }

  async continueAfterCustomerResolution(): Promise<void> {
    await continueResolvedCheckIn(this.returningContext());
  }

  async submitCustomerPhone(locationId: string, phone: string): Promise<void> {
    const normalized = normalizeJordanCustomerPhone(phone);
    await createPreIntakeSession(
      this.returningContext(),
      locationId,
      normalized
        ? { intent: "DIFFERENT_CUSTOMER", phone: normalized }
        : undefined,
    );
  }

  async completeCondition(conditionNote?: string): Promise<void> {
    await completeCheckInCondition(this.lifecycleContext(), conditionNote);
  }

  async createParkingTask(): Promise<void> {
    await createCheckInParkingTask(this.lifecycleContext());
  }

  async startParking(
    membershipId?: string | null,
  ): Promise<StartParkingPayload | null> {
    const targetMembership = membershipId ?? this.membershipId;
    return startCheckInParking(this.lifecycleContext(), targetMembership);
  }
}
