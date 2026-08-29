import { createHash } from "node:crypto";

import {
  normalizeVehicleIdentityInput,
  type NormalizedVehicleIdentity,
} from "../vehicles/vehicle-identity-command";
import {
  normalizeVehicleDetails,
  type NormalizedVehicleDetails,
} from "../vehicles/vehicle-details-normalization";
import {
  IntakeSessionCommandError,
  type IntakeSessionCommandRequest,
} from "./intake-session-types";

export type NormalizedIntakeCustomer =
  | {
      readonly customerId: string;
      readonly intent: "USE_SAVED_CUSTOMER";
    }
  | {
      readonly displayName: string | null;
      readonly intent: "DIFFERENT_CUSTOMER";
      readonly phoneNormalized: string;
    };

export interface NormalizedIntakeRequest {
  readonly authenticatedUserId: string;
  readonly customer: NormalizedIntakeCustomer | null;
  readonly intakeOperationId: string;
  readonly targetLocationId: string;
  readonly vehicleDetails: NormalizedVehicleDetails;
  readonly vehicleIdentity: NormalizedVehicleIdentity;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const operationKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const e164Pattern = /^\+[1-9][0-9]{1,14}$/;
const phonePresentationPattern = /[\s().\p{Pd}]+/gu;

function invalidInput(): never {
  throw new IntakeSessionCommandError("INTAKE_INPUT_INVALID");
}

function assertOnlyKeys(value: object, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) invalidInput();
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) invalidInput();
  return value.toLowerCase();
}

function customer(value: unknown): NormalizedIntakeCustomer | null {
  if (value === undefined) return null;
  if (value === null || typeof value !== "object") return invalidInput();
  const input = value as Record<string, unknown>;
  if (input.intent === "USE_SAVED_CUSTOMER") {
    assertOnlyKeys(input, ["customerId", "intent"]);
    return { customerId: uuid(input.customerId), intent: input.intent };
  }
  if (input.intent !== "DIFFERENT_CUSTOMER") return invalidInput();
  assertOnlyKeys(input, ["displayName", "intent", "phone"]);
  if (typeof input.phone !== "string") return invalidInput();
  const phoneNormalized = input.phone
    .trim()
    .normalize("NFKC")
    .replace(phonePresentationPattern, "");
  if (!e164Pattern.test(phoneNormalized)) return invalidInput();
  let displayName: string | null = null;
  if (input.displayName !== undefined) {
    if (typeof input.displayName !== "string") return invalidInput();
    displayName = input.displayName.trim().normalize("NFKC");
    if (displayName === "" || Array.from(displayName).length > 120) {
      return invalidInput();
    }
  }
  return { displayName, intent: input.intent, phoneNormalized };
}

export function normalizeIntakeRequest(
  request: IntakeSessionCommandRequest,
): NormalizedIntakeRequest {
  if (request === null || typeof request !== "object") return invalidInput();
  assertOnlyKeys(request, [
    "authenticatedUserId",
    "customer",
    "intakeOperationId",
    "targetLocationId",
    "vehicleDetails",
    "vehicleIdentity",
  ]);
  if (typeof request.intakeOperationId !== "string") return invalidInput();
  const operationId = request.intakeOperationId.trim().normalize("NFKC");
  if (!operationKeyPattern.test(operationId)) return invalidInput();
  return {
    authenticatedUserId: uuid(request.authenticatedUserId),
    customer: customer(request.customer),
    intakeOperationId: operationId,
    targetLocationId: uuid(request.targetLocationId),
    vehicleDetails: normalizeVehicleDetails(
      request.vehicleDetails,
      invalidInput,
    ),
    vehicleIdentity: normalizeVehicleIdentityInput(request.vehicleIdentity),
  };
}

export function intakeRequestFingerprint(
  request: NormalizedIntakeRequest,
  organizationId: string,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        actorUserId: request.authenticatedUserId,
        customer: request.customer,
        locationId: request.targetLocationId,
        organizationId,
        vehicleDetails: request.vehicleDetails,
        vehicleIdentity: request.vehicleIdentity,
      }),
    )
    .digest("hex");
}
