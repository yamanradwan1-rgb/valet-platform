import { normalizeJordanCheckInPhone } from "@valet/contracts";

import { ApiTransportValidationError } from "../../common/http/api-errors";
import {
  normalizePlateCountry,
  normalizePlateNumber,
  VehicleIdentityCommandError,
} from "../vehicles/vehicle-identity-command";
import type { VisitContactViewer } from "./management-visit-contact-authorization";

const controlCharacters = /[\p{Cc}\p{Cf}]/u;

export function normalizeVisitContactPhone(input: string): string {
  const result = normalizeJordanCheckInPhone(input);
  if (!result.ok) throw new ApiTransportValidationError();
  return result.phone;
}

export function normalizeVisitContactName(input: string): string {
  const normalized = input.trim().normalize("NFKC");
  const length = Array.from(normalized).length;
  if (length < 2 || length > 80 || controlCharacters.test(normalized)) {
    throw new ApiTransportValidationError();
  }
  return normalized.toLocaleLowerCase("en-US");
}

export function normalizeVisitContactDisplayName(input: string | null): string | null {
  if (input === null) return null;
  const normalized = input.trim().normalize("NFKC");
  const length = Array.from(normalized).length;
  if (length < 1 || length > 120 || controlCharacters.test(normalized)) {
    throw new ApiTransportValidationError();
  }
  return normalized;
}

export function normalizeVisitContactPlate(input: {
  readonly plate: string;
  readonly plateCountry: string;
}): { readonly plateCountry: string; readonly plateNumberNormalized: string } {
  try {
    return {
      plateCountry: normalizePlateCountry(input.plateCountry),
      plateNumberNormalized: normalizePlateNumber(input.plate).plateNumberNormalized,
    };
  } catch (error) {
    if (error instanceof VehicleIdentityCommandError) {
      throw new ApiTransportValidationError();
    }
    throw error;
  }
}

export function projectVisitContactPhone(
  phone: string,
  viewer: VisitContactViewer,
): { kind: "FULL"; value: string } | { kind: "MASKED"; ending: string } {
  if (viewer.role === "ORG_ADMIN") return { kind: "FULL", value: phone };
  return { kind: "MASKED", ending: phone.slice(-4) };
}

export function escapeLikePrefix(value: string): string {
  return value.replace(/[\\%_]/gu, (character) => `\\${character}`) + "%";
}
