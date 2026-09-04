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
import { EmployeeCheckInSessionCore } from "./employee-check-in-session-core";
import type { EmployeeCheckInVehicleDraft } from "./employee-check-in-types";

export class EmployeeCheckInSession extends EmployeeCheckInSessionCore {
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
    if (!["confirm", "returning", "customer"].includes(this.snapshot.phase))
      return;
    this.pendingRequest = null;
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
      this.publish({ ...this.snapshot, error: null, phase: "customer" });
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
        phase: result.vehicle === null ? "customer" : "returning",
        recognizedVehicle: result.vehicle,
      });
    } catch (error) {
      if (!this.isCurrent(request)) return;
      this.publishRecognitionFailure(error);
    }
  }

  continueWithoutRecognition(): void {
    if (this.snapshot.phase !== "confirm" || this.snapshot.error === null)
      return;
    this.publish({ ...this.snapshot, error: null, phase: "customer" });
  }

  chooseDifferentCustomer(): void {
    if (this.snapshot.phase !== "returning") return;
    this.publish({ ...this.snapshot, error: null, phase: "customer" });
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
    const normalized = normalizeJordanCheckInPhone(this.snapshot.customerPhone);
    return this.submit(
      normalized === ""
        ? undefined
        : { intent: "DIFFERENT_CUSTOMER", phone: normalized },
    );
  }

  private async submit(customer: IntakeRequest["customer"]): Promise<void> {
    const input: IntakeRequest = {
      ...(customer === undefined ? {} : { customer }),
      intakeOperationId: checkInOperationId(
        this.pendingRequest,
        this.options.createOperationId,
      ),
      targetLocationId: this.requiredLocation(),
      vehicleIdentity: buildCheckInIdentity(this.snapshot.vehicle),
    };
    this.pendingRequest = input;
    const request = ++this.sequence;
    this.publish({ ...this.snapshot, error: null, phase: "submitting" });
    const outcome = await runEmployeeCheckInIntake(
      this.options.transport,
      input,
    );
    if (this.isCurrent(request)) this.applyIntakeOutcome(outcome);
  }
}
