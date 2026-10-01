import { ApiTransportValidationError } from "../../common/http/api-errors";
import { ManagementAccessDeniedError } from "./management-authorization";

export class StaffOnboardingUnavailableError extends Error {
  readonly code = "STAFF_ONBOARDING_UNAVAILABLE";
  constructor() {
    super("Staff onboarding is not available.");
    this.name = "StaffOnboardingUnavailableError";
  }
}

export class StaffOnboardingOperationConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";
  constructor() {
    super("The operation identity conflicts with a different request.");
    this.name = "StaffOnboardingOperationConflictError";
  }
}

export function throwStaffOnboardingDatabaseError(error: unknown): never {
  const row = error as { readonly code?: string; readonly message?: string };
  if (row.code === "42501") throw new ManagementAccessDeniedError();
  if (row.code === "22023" || row.code === "23514") {
    throw new ApiTransportValidationError();
  }
  if (row.code === "P0001" && row.message === "IDEMPOTENCY_CONFLICT") {
    throw new StaffOnboardingOperationConflictError();
  }
  if (row.code === "P0001" && row.message === "STAFF_ONBOARDING_UNAVAILABLE") {
    throw new StaffOnboardingUnavailableError();
  }
  throw error;
}
