import type { IntakeRequest } from "@valet/contracts";

import { isAmbiguousCheckInFailure } from "./employee-check-in-domain";
import type {
  EmployeeCheckInSessionOptions,
  EmployeeCheckInTransport,
  EmployeeCheckInVehicleDraft,
} from "./employee-check-in-types";
import { operationalFailure } from "./employee-operational-recovery";

export type EmployeeCheckInIntakeOutcome =
  | {
      readonly kind: "SUCCESS";
      readonly result: Awaited<
        ReturnType<EmployeeCheckInTransport["createIntake"]>
      >;
    }
  | {
      readonly kind: "AMBIGUOUS";
      readonly failure: ReturnType<typeof operationalFailure>;
    }
  | {
      readonly kind: "FAILURE";
      readonly failure: ReturnType<typeof operationalFailure>;
    };

export async function runEmployeeCheckInIntake(
  transport: EmployeeCheckInTransport,
  input: IntakeRequest,
): Promise<EmployeeCheckInIntakeOutcome> {
  try {
    return { kind: "SUCCESS", result: await transport.createIntake(input) };
  } catch (error) {
    const failure = operationalFailure(error);
    return isAmbiguousCheckInFailure(error)
      ? { failure, kind: "AMBIGUOUS" }
      : { failure, kind: "FAILURE" };
  }
}

export function checkInOperationId(
  pending: IntakeRequest | null,
  createOperationId: EmployeeCheckInSessionOptions["createOperationId"],
): string {
  return pending?.intakeOperationId ?? createOperationId();
}

export function checkInVehicleDisplay(
  vehicle: EmployeeCheckInVehicleDraft,
): string {
  return vehicle.mode === "CONFIRMED_PLATE"
    ? vehicle.plateNumberRaw
    : vehicle.temporaryDescriptor;
}
