import { UnauthorizedException } from "@nestjs/common";
import { ApiTransportValidationError } from "../../common/http/api-errors";
import { MfaStepUpRequiredError } from "../auth/mfa/mfa-errors";
import { ManagementAccessDeniedError } from "./management-authorization";

const messages = {
  IDEMPOTENCY_CONFLICT: "The operation conflicts with an earlier request.",
  OPEN_TASK_HANDOFF_REQUIRED:
    "Open Task ownership must be handed off before ending the Shift.",
  SHIFT_ALREADY_ENDED: "The Shift has already ended.",
} as const;

export class StaffShiftForceEndError extends Error {
  constructor(readonly code: keyof typeof messages) {
    super(messages[code]);
    this.name = "StaffShiftForceEndError";
  }
}

export function throwStaffShiftForceEndDatabaseError(error: unknown): never {
  const value = error as { code?: unknown; message?: unknown } | null;
  if (value?.code === "42501") {
    if (value.message === "STAFF_SESSION_INVALID")
      throw new UnauthorizedException();
    throw new ManagementAccessDeniedError();
  }
  if (value?.code === "P0001") {
    if (value.message === "MFA_STEP_UP_REQUIRED")
      throw new MfaStepUpRequiredError();
    if (value.message === "FORCE_END_REQUEST_INVALID")
      throw new ApiTransportValidationError();
    if (
      typeof value.message === "string" &&
      Object.hasOwn(messages, value.message)
    ) {
      throw new StaffShiftForceEndError(value.message as keyof typeof messages);
    }
  }
  // Do not propagate SQL detail/context: it may contain operator free text.
  throw new Error("Shift administrative closure could not be completed.");
}
