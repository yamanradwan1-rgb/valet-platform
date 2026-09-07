import type { ReactElement } from "react";
import { vi } from "vitest";
import {
  continuationForSession,
  type EmployeeCheckInConditionSelection,
  type EmployeeCheckInSession,
  type EmployeeCheckInSnapshot,
  type NativeAuthSession,
} from "@valet/employee-client";

export type Element = ReactElement<Record<string, unknown>>;

export function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  if (typeof node.type === "function")
    return elements((node.type as (props: unknown) => unknown)(node.props));
  return [node, ...elements(node.props.children)];
}

export function style(node: Element): Record<string, unknown> {
  return Object.assign(
    {},
    ...[node.props.style].flat(Infinity).filter(Boolean),
  );
}

export function label(node: Element): string {
  return String(node.props.accessibilityLabel ?? node.props.children ?? "");
}

export function content(nodes: Element[]): string {
  return nodes
    .flatMap((node) => [node.props.children].flat())
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

export const conditionActive = {
  conditionCompletedAt: null as string | null,
  sessionId: "session-id",
  state: "CHECKING_IN" as const,
  vehicle: {
    color: "Black",
    make: "Toyota",
    model: "Camry",
    plateCountry: "JO",
    plateNumberRaw: "12-34567",
    temporaryDescriptor: null,
    vehicleId: "vehicle-id",
    vehicleUpdatedAt: "2026-09-04T08:00:00.000Z",
  },
  version: 1,
};

export function conditionSnapshot(
  mode: EmployeeCheckInSnapshot["continuation"]["mode"] = "select-condition",
  patch: Partial<EmployeeCheckInSnapshot> = {},
): EmployeeCheckInSnapshot {
  return {
    active: conditionActive,
    continuation: { ...continuationForSession(conditionActive, mode), mode },
    customerPhone: "",
    error: null,
    identityGeneration: 4,
    locationId: "location-id",
    phase: "created",
    recognizedVehicle: null,
    recoverables: [],
    recoveryChecked: false,
    vehicle: {
      mode: "CONFIRMED_PLATE",
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: "",
    },
    ...patch,
  };
}

export function conditionController() {
  return {
    cancelVehicleEdit: vi.fn(),
    continueVehicleIntake: vi.fn(),
    editVehicleDetails: vi.fn(),
    editVehicleIdentity: vi.fn(),
    retryConditionRecovery: vi.fn(),
    retryCorrectionRecovery: vi.fn(),
    reviewVehicleIdentity: vi.fn(),
    setConditionSelection: vi.fn(),
    setVehicleDetails: vi.fn(),
    setVehicleIdentity: vi.fn(),
    submitConditionCompletion: vi.fn(),
    submitIdentityCorrection: vi.fn(),
    submitVehicleDetails: vi.fn(),
  } as unknown as EmployeeCheckInSession;
}

export function selectCondition(
  snapshot: EmployeeCheckInSnapshot,
  selection: EmployeeCheckInConditionSelection,
): EmployeeCheckInSnapshot {
  return {
    ...snapshot,
    continuation: {
      ...snapshot.continuation,
      conditionSelection: selection,
    },
  };
}

export type ConditionWorkflowProps = Parameters<
  typeof import("../src/check-in/native-check-in-workflow").NativeCheckInWorkflow
>[0] & { readonly auth: NativeAuthSession };
