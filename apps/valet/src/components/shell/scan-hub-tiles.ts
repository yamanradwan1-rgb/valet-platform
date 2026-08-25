import type { StartParkingPayload } from "../../features/check-in";
import type { Screen } from "../../types/employee-ui";
import type {
  ActiveParkingTarget,
  ActiveRetrievalTarget,
} from "./employee-workspace";

/**
 * VUI-011B context-aware Scan Hub tile gates (DEC-066 §5).
 *
 * The hub is a launcher over ALREADY-HELD authoritative workflow context
 * only: it performs no session discovery, treats no resource code as
 * authorization and constructs no new sessionId/taskId/taskVersion. Each
 * gate derives purely from the identity-bound workspace targets the Live
 * app already holds, so a disabled reason is always truthful.
 */

/**
 * Dictionary keys carrying the truthful localized disabled reasons.
 * Keys derive from the English dictionary; EN/AR parity is asserted by test.
 */
export type ScanHubDisabledReasonKey =
  | "scanHubKeySlotDisabled"
  | "scanHubParkingDisabled"
  | "scanHubRetrievalDisabled";

export interface ScanHubTileGate {
  readonly available: boolean;
  /** Dictionary key of the truthful reason shown while disabled; null when available. */
  readonly disabledReasonKey: ScanHubDisabledReasonKey | null;
}

export interface ScanHubParkingGate extends ScanHubTileGate {
  /** Exact existing workspace objects echoed unchanged for flow resume. */
  readonly parkingPayload: StartParkingPayload | null;
  readonly parkingTarget: ActiveParkingTarget | null;
}

export interface ScanHubRetrievalGate extends ScanHubTileGate {
  /** Exact existing retrieval target echoed unchanged; never rebuilt. */
  readonly retrievalTarget: ActiveRetrievalTarget | null;
}

/** The four launcher tiles rendered by the Scan Hub. */
export type ScanHubActionTile =
  | "keySlot"
  | "licensePlate"
  | "parkingSpot"
  | "pickupHandoff";

/**
 * License Plate may always launch the existing Check-In flow; manual plate
 * entry inside that flow remains the operation (no OCR/camera here).
 */
export function licensePlateGate(): ScanHubTileGate {
  return { available: true, disabledReasonKey: null };
}

/**
 * Key Slot stays permanently disabled at top level in this slice: the
 * workspace holds no key-assignment target here, and inventing scan-first
 * session discovery or blind Check-In routing is prohibited (DEC-066 §5).
 */
export function keySlotGate(): ScanHubTileGate {
  return { available: false, disabledReasonKey: "scanHubKeySlotDisabled" };
}

/**
 * Parking Spot resumes the EXISTING ParkingFlow unchanged only when the app
 * already holds sufficient identity-bound context: an explicit parking task
 * target OR an in-flight start-parking payload handed over from Check-In.
 * Both existing objects are echoed back exactly as held — nothing new is
 * constructed and no target is ever rebuilt from a spot code.
 */
export function parkingSpotGate(
  parkingTarget: ActiveParkingTarget | null,
  parkingPayload: StartParkingPayload | null,
): ScanHubParkingGate {
  const available = parkingTarget !== null || parkingPayload !== null;
  return {
    available,
    disabledReasonKey: available ? null : "scanHubParkingDisabled",
    parkingPayload,
    parkingTarget,
  };
}

/**
 * Pickup/Handoff resumes the EXISTING RetrievalFlow only via its exact
 * current retrieval target, echoed unchanged.
 */
export function pickupHandoffGate(
  retrievalTarget: ActiveRetrievalTarget | null,
): ScanHubRetrievalGate {
  const available = retrievalTarget !== null;
  return {
    available,
    disabledReasonKey: available ? null : "scanHubRetrievalDisabled",
    retrievalTarget,
  };
}

/**
 * Launch target of each actionable tile, always an existing permitted
 * screen. The Key Slot tile maps to NO route: a top-level launcher must
 * never guess a workflow entry point on the employee's behalf.
 */
export function scanHubLaunchTarget(
  tile: ScanHubActionTile,
): Screen | null {
  if (tile === "licensePlate") return "check-in";
  if (tile === "parkingSpot") return "parking";
  if (tile === "pickupHandoff") return "retrieval";
  return null;
}

/**
 * Performs a tile launch through the Live shell's guarded nav callback and
 * reports whether the tile has a route at all. Route-less tiles (Key Slot)
 * never invoke nav, so a tap cannot reach any guessed workflow entry point.
 */
export function launchScanHubTile(
  tile: ScanHubActionTile,
  nav: (s: Screen) => void,
): boolean {
  const target = scanHubLaunchTarget(tile);
  if (target === null) return false;
  nav(target);
  return true;
}
