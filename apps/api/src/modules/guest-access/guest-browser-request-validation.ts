import { emptyRequestSchema } from "@valet/contracts";
import { ApiTransportValidationError } from "../../common/http/api-errors";

export function requireEmptyGuestRequest(value: unknown): void {
  if (!emptyRequestSchema.safeParse(value ?? {}).success) {
    throw new ApiTransportValidationError();
  }
}
