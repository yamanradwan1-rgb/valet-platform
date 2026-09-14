import type { IntakeRequest } from "@valet/contracts";

import {
  buildCheckInIdentity,
  validateCheckInVehicle,
} from "./employee-check-in-domain";
import {
  checkInOperationId,
  runEmployeeCheckInIntake,
} from "./employee-check-in-intake";
import { normalizeJordanCheckInPhone } from "./employee-check-in-state";
import { EmployeeCheckInContinuationSession } from "./employee-check-in-continuation-session";
import type { EmployeeCheckInVehicleDraft } from "./employee-check-in-types";

export class EmployeeCheckInSession extends EmployeeCheckInContinuationSession {
  private returningCorrection: {
    readonly color: string | null;
    readonly make: string | null;
    readonly model: string | null;
  } | null = null;

  activate(
    identityGeneration: number,
    locationId: string,
    workflowOwner = locationId,
  ): Promise<void> {
    const current = this.current();
    if (
      current.identityGeneration !== identityGeneration ||
      current.locationId !== locationId ||
      this.workflowOwner !== workflowOwner
    ) {
      this.returningCorrection = null;
    }
    return super.activate(identityGeneration, locationId, workflowOwner);
  }

  clear(): void {
    this.returningCorrection = null;
    super.clear();
  }

  startNew(): void {
    this.returningCorrection = null;
    super.startNew();
  }

  setVehicle(patch: Partial<EmployeeCheckInVehicleDraft>): void {
    if (this.snapshot.phase !== "capture") return;
    this.pendingRequest = null;
    this.publish({
      ...this.snapshot,
      customerPhone: "",
      error: null,
      recognizedVehicle: null,
      vehicle: { ...this.snapshot.vehicle, ...patch },
    });
  }

  reviewIdentity(): void {
    if (this.snapshot.phase !== "capture") return;
    const validation = validateCheckInVehicle(this.snapshot.vehicle);
    if (validation.error !== undefined) {
      this.fail(validation.error);
      return;
    }
    this.publish({
      ...this.snapshot,
      error: null,
      phase: "confirm",
      vehicle: validation.vehicle,
    });
  }

  editIdentity(): void {
    if (
      !["confirm", "returning", "vehicle-details", "customer"].includes(
        this.snapshot.phase,
      )
    )
      return;
    this.pendingRequest = null;
    this.returningCorrection = null;
    this.publish({
      ...this.snapshot,
      error: null,
      phase: "capture",
      recognizedVehicle: null,
    });
  }

  async confirmIdentity(): Promise<void> {
    if (this.snapshot.phase !== "confirm") return;
    const vehicle = this.snapshot.vehicle;
    if (vehicle.mode === "TEMPORARY_DESCRIPTOR") {
      this.publish({ ...this.snapshot, error: null, phase: "vehicle-details" });
      return;
    }
    const request = ++this.sequence;
    this.publish({ ...this.snapshot, error: null, phase: "recognizing" });
    try {
      const result = await this.options.transport.recognize({
        targetLocationId: this.requiredLocation(),
        vehicleIdentity: {
          confirmedByHuman: true,
          mode: "CONFIRMED_PLATE",
          plateCountry: vehicle.plateCountry,
          plateNumberRaw: vehicle.plateNumberRaw,
        },
      });
      if (!this.isCurrent(request)) return;
      this.publish({
        ...this.snapshot,
        error: null,
        phase: result.vehicle === null ? "vehicle-details" : "returning",
        recognizedVehicle: result.vehicle,
      });
      this.returningCorrection = null;
    } catch (error) {
      if (!this.isCurrent(request)) return;
      this.publishRecognitionFailure(error);
    }
  }

  continueWithoutRecognition(): void {
    if (this.snapshot.phase !== "confirm" || this.snapshot.error === null)
      return;
    this.publish({ ...this.snapshot, error: null, phase: "vehicle-details" });
  }

  setPreIntakeVehicleDetails(
    patch: Partial<
      Pick<
        EmployeeCheckInVehicleDraft,
        "color" | "make" | "model" | "temporaryDescriptor"
      >
    >,
  ): void {
    if (this.snapshot.phase !== "vehicle-details") return;
    this.publish({
      ...this.snapshot,
      error: null,
      vehicle: { ...this.snapshot.vehicle, ...patch },
    });
  }

  continueVehicleDetails(): void {
    if (this.snapshot.phase !== "vehicle-details") return;
    if (
      this.snapshot.vehicle.mode === "TEMPORARY_DESCRIPTOR" &&
      this.snapshot.vehicle.temporaryDescriptor.trim() === ""
    ) {
      this.fail({
        code: "TEMPORARY_DESCRIPTOR_REQUIRED",
        message: "Describe the vehicle to continue without a plate.",
      });
      return;
    }
    this.publish({ ...this.snapshot, error: null, phase: "customer" });
  }

  chooseDifferentCustomer(): void {
    if (this.snapshot.phase !== "returning") return;
    this.publish({ ...this.snapshot, error: null, phase: "customer" });
  }

  setReturningVehicleCorrection(details: {
    readonly color: string | null;
    readonly make: string | null;
    readonly model: string | null;
  }): void {
    if (this.snapshot.phase !== "returning") return;
    const recognized = this.snapshot.recognizedVehicle;
    if (recognized === null) return;
    this.returningCorrection = details;
    this.publish({
      ...this.snapshot,
      error: null,
      recognizedVehicle: { ...recognized, ...details },
    });
  }

  setCustomerPhone(customerPhone: string): void {
    if (this.snapshot.phase !== "customer") return;
    this.publish({ ...this.snapshot, customerPhone, error: null });
  }

  useSavedCustomer(): Promise<void> {
    const suggestion = this.snapshot.recognizedVehicle?.returningCustomer;
    if (
      this.snapshot.phase !== "returning" ||
      suggestion === null ||
      suggestion === undefined
    ) {
      return Promise.resolve();
    }
    return this.submit({
      customerId: suggestion.customerId,
      intent: "USE_SAVED_CUSTOMER",
    });
  }

  submitCustomer(): Promise<void> {
    if (this.snapshot.phase !== "customer") return Promise.resolve();
    if (this.snapshot.customerPhone.trim() === "")
      return this.submit(undefined);
    const normalized = normalizeJordanCheckInPhone(this.snapshot.customerPhone);
    if (!normalized.ok) return Promise.resolve();
    return this.submit({
      intent: "DIFFERENT_CUSTOMER",
      phone: normalized.phone,
    });
  }

  private async submit(customer: IntakeRequest["customer"]): Promise<void> {
    const input: IntakeRequest = {
      ...(customer === undefined ? {} : { customer }),
      intakeOperationId: checkInOperationId(
        this.pendingRequest,
        this.options.createOperationId,
      ),
      targetLocationId: this.requiredLocation(),
      ...(this.snapshot.recognizedVehicle === null
        ? {
            vehicleDetails: {
              color: this.snapshot.vehicle.color ?? null,
              make: this.snapshot.vehicle.make ?? null,
              model: this.snapshot.vehicle.model ?? null,
            },
          }
        : {}),
      vehicleIdentity: buildCheckInIdentity(this.snapshot.vehicle),
    };
    this.pendingRequest = input;
    const request = ++this.sequence;
    this.publish({ ...this.snapshot, error: null, phase: "submitting" });
    const outcome = await runEmployeeCheckInIntake(
      this.options.transport,
      input,
    );
    if (!this.isCurrent(request)) return;
    const correction = this.returningCorrection;
    this.applyIntakeOutcome(outcome);
    if (outcome.kind === "SUCCESS" && correction !== null) {
      this.editVehicleDetails();
      this.setVehicleDetails({
        color: correction.color ?? "",
        make: correction.make ?? "",
        model: correction.model ?? "",
      });
      await this.submitVehicleDetails();
      if (
        this.snapshot.phase === "created" &&
        this.snapshot.continuation.mode === "view"
      ) {
        this.returningCorrection = null;
        this.continueVehicleIntake();
      }
    }
  }
}
