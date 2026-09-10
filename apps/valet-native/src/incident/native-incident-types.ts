import type {
  IncidentSeverity,
  IncidentType,
  ReportIncidentResponse,
  StaffValetSessionDetailResponse,
} from "@valet/employee-client";
import type { NativeContextualTarget } from "../shell/native-contextual-route";

export const nativeIncidentTypes: readonly IncidentType[] = [
  "VEHICLE_DAMAGE",
  "KEY_MISSING",
  "WRONG_KEY",
  "KEY_DAMAGED",
  "KEY_LOCKED_INSIDE",
  "UNAUTHORIZED_ZONE_EXIT",
  "WRONG_VEHICLE_HANDOFF_ATTEMPT",
  "PAYMENT_DISPUTE",
  "CUSTOMER_COMPLAINT",
  "EMPLOYEE_SAFETY",
  "SYSTEM_CONNECTION",
  "OTHER",
];

export const nativeIncidentSeverities: readonly IncidentSeverity[] = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
];

export type NativeIncidentSnapshot = {
  readonly detail: StaffValetSessionDetailResponse | null;
  readonly error: string | null;
  readonly report: ReportIncidentResponse | null;
  readonly target: NativeContextualTarget | null;
  readonly phase:
    | "inactive"
    | "loading"
    | "context-error"
    | "form"
    | "submitting"
    | "success";
};

export interface NativeIncidentSubmitInput {
  readonly description: string;
  readonly severity: IncidentSeverity;
  readonly type: IncidentType;
}

export function nativeIncidentVehicleLine(
  detail: StaffValetSessionDetailResponse,
): string {
  const { heading, identifier } = nativeIncidentVehicleIdentity(detail);
  return [heading, identifier].filter(Boolean).join(" · ");
}

export function nativeIncidentVehicleIdentity(
  detail: StaffValetSessionDetailResponse,
): { readonly heading: string; readonly identifier: string } {
  const heading = [detail.vehicle.make, detail.vehicle.model]
    .filter(Boolean)
    .join(" ");
  const identifier =
    detail.vehicle.plateNumberRaw ?? detail.vehicle.temporaryDescriptor ?? "";
  return { heading, identifier };
}
