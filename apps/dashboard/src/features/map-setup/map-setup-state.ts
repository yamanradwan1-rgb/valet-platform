import type {
  LocationMapArea,
  LocationMapPoint,
  UpdateLocationMapAreaRequest,
  UpdateLocationMapPointRequest,
} from "@valet/contracts";

import { DashboardApiError } from "../../lib/api/api-error";
import type { TranslationKey } from "../../i18n/translations/types";

import type { MapSetupData } from "./map-setup-api";

/**
 * Pure Map Setup state derivation.
 *
 * The React hook keeps all identity bookkeeping here so stale responses can
 * never take over: every settled result is stamped with BOTH the attempt that
 * issued it and the locationId it was requested for. A response only becomes
 * visible when both identities still match the current request.
 */

export type SetupLoadOutcome =
  | {
      readonly phase: "error";
      readonly error: DashboardApiError;
    }
  | {
      readonly data: MapSetupData;
      readonly phase: "ready";
    };

export interface SettledLoad {
  readonly attempt: number;
  readonly locationId: string;
  readonly outcome: SetupLoadOutcome;
}

export type SetupLoadState =
  | { readonly phase: "loading" }
  | { readonly phase: "ready"; readonly data: MapSetupData }
  | { readonly phase: "error"; readonly error: DashboardApiError };

/**
 * Derives what the UI may render. Any identity mismatch (newer attempt or a
 * different location) collapses to `loading` — a slow Location A response can
 * never replace Location B data even if an abort were lost.
 */
export function selectSetupLoadState(
  settled: SettledLoad | null,
  requestLocationId: string,
  attempt: number,
): SetupLoadState {
  if (
    settled === null ||
    settled.attempt !== attempt ||
    settled.locationId !== requestLocationId
  ) {
    return { phase: "loading" };
  }
  return settled.outcome;
}

/** Replace-by-id, append when new; existing order is otherwise preserved. */
export function upsertPoint(
  points: readonly LocationMapPoint[],
  entity: LocationMapPoint,
): LocationMapPoint[] {
  const index = points.findIndex((point) => point.id === entity.id);
  if (index === -1) return [...points, entity];
  return points.map((point) => (point.id === entity.id ? entity : point));
}

export function upsertArea(
  areas: readonly LocationMapArea[],
  entity: LocationMapArea,
): LocationMapArea[] {
  const index = areas.findIndex((area) => area.id === entity.id);
  if (index === -1) return [...areas, entity];
  return areas.map((area) => (area.id === entity.id ? entity : area));
}

/**
 * Duplicate-submission guard. While any map-setup mutation is in flight no
 * further operation may start; controls are disabled with the same pending
 * key so double clicks and double submits are impossible.
 */
export function beginMutation(
  pendingOperation: string | null,
): "blocked" | "started" {
  return pendingOperation === null ? "started" : "blocked";
}

export type MutationResult =
  | { readonly kind: "area"; readonly entity: LocationMapArea }
  | { readonly kind: "point"; readonly entity: LocationMapPoint };

/**
 * Normalizes any thrown value into an honest DashboardApiError so failure
 * mapping never depends on what a transport or browser happened to throw.
 */
export function normalizeFailure(error: unknown): DashboardApiError {
  if (error instanceof DashboardApiError) return error;
  return new DashboardApiError({
    code: "MAP_SETUP_UNEXPECTED_ERROR",
    kind: "server",
    message: "Map setup failed for an unexpected reason.",
    status: 0,
  });
}

/**
 * Unwraps a settled mutation for its authoritative entity. `undefined` means
 * the duplicate-submit guard blocked the operation before any request was
 * made — surfaced as an honest local failure, never as success.
 */
export function unwrapPoint(result: MutationResult | undefined): LocationMapPoint {
  if (result === undefined || result.kind !== "point") {
    throw new Error("MAP_SETUP_MUTATION_SUPERSEDED");
  }
  return result.entity;
}

export function unwrapArea(result: MutationResult | undefined): LocationMapArea {
  if (result === undefined || result.kind !== "area") {
    throw new Error("MAP_SETUP_MUTATION_SUPERSEDED");
  }
  return result.entity;
}

/**
 * Pure reconciliation step after a successful mutation: upserts the backend
 * entity into currently-visible ready data, but ONLY while the settled load
 * still belongs to the same location the mutation targeted. A location
 * switch between send and response therefore discards the stale entity.
 */
export function mergeMutationIntoSettled(
  current: SettledLoad | null,
  targetLocationId: string,
  result: MutationResult,
): SettledLoad | null {
  if (
    current === null ||
    current.locationId !== targetLocationId ||
    current.outcome.phase !== "ready"
  ) {
    return current;
  }
  if (result.kind === "point") {
    return {
      ...current,
      outcome: {
        data: {
          ...current.outcome.data,
          points: upsertPoint(current.outcome.data.points, result.entity),
        },
        phase: "ready",
      },
    };
  }
  return {
    ...current,
    outcome: {
      data: {
        ...current.outcome.data,
        areas: upsertArea(current.outcome.data.areas, result.entity),
      },
      phase: "ready",
    },
  };
}

export function setupFailureMessageKey(error: unknown): TranslationKey {
  const candidate = error as Partial<DashboardApiError> | null;
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    typeof candidate.kind !== "string"
  ) {
    return "errors.requestFailed";
  }
  if (candidate.isNetworkError === true) {
    return "states.networkError";
  }
  switch (candidate.kind) {
    case "session-expired":
      return "errors.sessionExpired";
    case "forbidden":
    case "authorization-masked":
      return "errors.accessDenied";
    case "rate-limited":
      return "errors.rateLimited";
    case "conflict":
      return "mapSetup.errors.conflict";
    default:
      return "mapSetup.errors.actionFailed";
  }
}

export interface PointPatchInput {
  readonly active: boolean;
  readonly code: string;
  readonly kind: LocationMapPoint["kind"];
  readonly label: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly levelLabel: string | null;
}

/**
 * Changed-fields-only point patch against the authoritative snapshot.
 *
 * Field-safety guarantees (pinned by tests): editing one field never resends
 * unrelated authoritative fields; `levelLabel: null` is sent ONLY when the
 * user explicitly cleared an optional value that was set; coordinates are
 * sent only when their parsed value actually differs. An untouched form
 * yields `{}` and cannot be submitted.
 */
export function buildPointPatch(
  original: LocationMapPoint,
  next: PointPatchInput,
): UpdateLocationMapPointRequest {
  const patch: Record<string, unknown> = {};
  if (next.code !== original.code) patch.code = next.code;
  if (next.label !== original.label) patch.label = next.label;
  if (next.kind !== original.kind) patch.kind = next.kind;
  if (next.latitude !== null && next.latitude !== original.latitude) {
    patch.latitude = next.latitude;
  }
  if (next.longitude !== null && next.longitude !== original.longitude) {
    patch.longitude = next.longitude;
  }
  if (next.levelLabel !== original.levelLabel) {
    patch.levelLabel = next.levelLabel;
  }
  if (next.active !== original.active) patch.active = next.active;
  return patch as UpdateLocationMapPointRequest;
}

export interface AreaPatchInput {
  readonly active: boolean;
  readonly code: string;
  readonly label: string;
  readonly levelLabel: string | null;
  readonly parkingZoneId: string | null;
  readonly purpose: LocationMapArea["purpose"];
}

/**
 * Changed-fields-only area METADATA patch. Vertices are structurally
 * impossible to include here (no field exists on the input), preserving the
 * backend's separation between metadata updates and vertex replacement.
 * An untouched parkingZoneId is preserved verbatim — it is only included in
 * the patch when the caller's intended value differs from the snapshot.
 */
export function buildAreaPatch(
  original: LocationMapArea,
  next: AreaPatchInput,
): UpdateLocationMapAreaRequest {
  const patch: Record<string, unknown> = {};
  if (next.code !== original.code) patch.code = next.code;
  if (next.label !== original.label) patch.label = next.label;
  if (next.purpose !== original.purpose) patch.purpose = next.purpose;
  if (next.levelLabel !== original.levelLabel) {
    patch.levelLabel = next.levelLabel;
  }
  if (next.parkingZoneId !== original.parkingZoneId) {
    patch.parkingZoneId = next.parkingZoneId;
  }
  if (next.active !== original.active) patch.active = next.active;
  return patch as UpdateLocationMapAreaRequest;
}
