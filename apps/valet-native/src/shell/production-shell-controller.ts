import type {
  EmployeeOperationalScope,
  EmployeeOperationalSnapshot,
  NativeAuthSnapshot,
} from "@valet/employee-client";

export type ProductionDestination =
  | "check-in"
  | "parking"
  | "retrieval"
  | "scan"
  | "shift"
  | "tasks"
  | "vehicles";

export type ProductionIntentSource = "cold" | "navigation" | "scan";

export interface ProductionRouteIntent {
  readonly destination: ProductionDestination;
  readonly source: ProductionIntentSource;
}

export type ProductionShellState =
  | { readonly kind: "access-denied" }
  | { readonly kind: "auth-error" }
  | { readonly kind: "auth-restoring" }
  | { readonly kind: "auth-recovery" }
  | { readonly kind: "context-loading" }
  | { readonly kind: "logged-out" }
  | { readonly kind: "no-active-shift" }
  | { readonly kind: "no-usable-location" }
  | {
      readonly kind: "operational-error";
      readonly reason: "ambiguous-active-shifts" | "unavailable";
    }
  | {
      readonly destination:
        "check-in" | "parking" | "retrieval" | "shift" | "tasks";
      readonly kind: "active";
      readonly scope: EmployeeOperationalScope;
    };

export type IntentReceipt = "held" | "rejected" | "resolved";

interface PendingIntent {
  readonly intent: ProductionRouteIntent;
  readonly receivedAuthority: string | null;
}

interface ConfirmedAuthority {
  readonly authGeneration: number;
  readonly key: string;
}

const destinations = new Set<ProductionDestination>([
  "check-in",
  "parking",
  "retrieval",
  "scan",
  "shift",
  "tasks",
  "vehicles",
]);
const sources = new Set<ProductionIntentSource>(["cold", "navigation", "scan"]);

export function parseProductionRouteIntent(
  value: unknown,
): ProductionRouteIntent | null {
  if (value === null || typeof value !== "object") return null;
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== "destination" || keys[1] !== "source") {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.destination !== "string" ||
    !destinations.has(candidate.destination as ProductionDestination) ||
    typeof candidate.source !== "string" ||
    !sources.has(candidate.source as ProductionIntentSource)
  ) {
    return null;
  }
  return {
    destination: candidate.destination as ProductionDestination,
    source: candidate.source as ProductionIntentSource,
  };
}

export function productionRouteIntentFromParam(
  value: string | readonly string[] | undefined,
): ProductionRouteIntent | null {
  if (
    typeof value !== "string" ||
    !destinations.has(value as ProductionDestination)
  ) {
    return null;
  }
  return { destination: value as ProductionDestination, source: "cold" };
}

export function deriveProductionShellState(
  auth: NativeAuthSnapshot,
  operations: EmployeeOperationalSnapshot,
):
  | Exclude<ProductionShellState, { readonly kind: "active" }>
  | {
      readonly kind: "active";
      readonly scope: EmployeeOperationalScope;
    } {
  if (auth.phase === "restoring") return { kind: "auth-restoring" };
  if (auth.phase === "restoration-unavailable")
    return { kind: "auth-recovery" };
  if (auth.phase === "fatal") return { kind: "auth-error" };
  if (auth.phase !== "authenticated") return { kind: "logged-out" };
  if (operations.identityGeneration !== auth.authGeneration) {
    return { kind: "context-loading" };
  }
  if (
    operations.phase === "inactive" ||
    operations.phase === "loading-context"
  ) {
    return { kind: "context-loading" };
  }
  if (
    operations.phase === "access-denied" ||
    (operations.phase === "error" &&
      operations.contextFailure?.code === "AUTHORIZATION_DENIED")
  ) {
    return { kind: "access-denied" };
  }
  if (operations.phase === "no-usable-location") {
    return { kind: "no-usable-location" };
  }
  if (operations.phase === "no-active-shift") {
    return { kind: "no-active-shift" };
  }
  if (operations.phase === "ambiguous-active-shifts") {
    return { kind: "operational-error", reason: "ambiguous-active-shifts" };
  }
  if (operations.phase !== "ready" || operations.scope === null) {
    return { kind: "operational-error", reason: "unavailable" };
  }
  return { kind: "active", scope: operations.scope };
}

export class ProductionShellController {
  private authority: ConfirmedAuthority | null = null;
  private authorityReady = false;
  private destination:
    "check-in" | "parking" | "retrieval" | "shift" | "tasks" = "tasks";
  private pending: PendingIntent | null = null;
  private purgeLatched = false;
  private purgeRevision = 0;

  receive(value: unknown): IntentReceipt {
    const intent = parseProductionRouteIntent(value);
    if (intent === null) return "rejected";
    if (!this.authorityReady) {
      this.pending = { intent, receivedAuthority: this.authority?.key ?? null };
      return "held";
    }
    return this.resolveIntent(intent);
  }

  currentWorkflowPurgeRevision(): number {
    return this.purgeRevision;
  }

  back(): boolean {
    if (!this.authorityReady || this.destination === "tasks") return false;
    this.destination = "tasks";
    return true;
  }

  update(
    auth: NativeAuthSnapshot,
    operations: EmployeeOperationalSnapshot,
  ): ProductionShellState {
    const state = deriveProductionShellState(auth, operations);
    if (state.kind !== "active") {
      if (this.canPreserveAcrossRevalidation(auth, operations, state)) {
        this.authorityReady = false;
        return state;
      }
      if (this.authority !== null) this.purgeProtectedState();
      this.authorityReady = false;
      if (
        state.kind === "access-denied" ||
        state.kind === "no-active-shift" ||
        state.kind === "no-usable-location" ||
        state.kind === "operational-error"
      ) {
        this.pending = null;
      }
      return state;
    }

    const nextAuthority = authorityKey(auth.authGeneration, state.scope);
    if (this.authority !== null && this.authority.key !== nextAuthority) {
      this.purgeProtectedState();
    }
    this.authorityReady = true;
    this.authority = {
      authGeneration: auth.authGeneration,
      key: nextAuthority,
    };
    this.purgeLatched = false;
    if (this.pending !== null) {
      const pending = this.pending;
      this.pending = null;
      if (
        pending.receivedAuthority === null ||
        pending.receivedAuthority === nextAuthority
      ) {
        this.resolveIntent(pending.intent);
      }
    }
    return { ...state, destination: this.destination };
  }

  private canPreserveAcrossRevalidation(
    auth: NativeAuthSnapshot,
    operations: EmployeeOperationalSnapshot,
    state: Exclude<ProductionShellState, { readonly kind: "active" }>,
  ): boolean {
    const authority = this.authority;
    if (
      authority === null ||
      auth.phase !== "authenticated" ||
      auth.authGeneration !== authority.authGeneration
    ) {
      return false;
    }
    if (
      state.kind === "context-loading" &&
      operations.identityGeneration !== null &&
      operations.identityGeneration < authority.authGeneration
    ) {
      return true;
    }
    if (operations.identityGeneration !== authority.authGeneration)
      return false;
    if (state.kind === "operational-error") {
      return state.reason === "unavailable";
    }
    if (state.kind !== "context-loading") return false;
    return (
      operations.scope === null ||
      authority.key === authorityKey(auth.authGeneration, operations.scope)
    );
  }

  private purgeProtectedState(): void {
    this.destination = "tasks";
    this.pending = null;
    if (this.purgeLatched) return;
    this.purgeLatched = true;
    this.purgeRevision += 1;
  }

  private resolveIntent(intent: ProductionRouteIntent): IntentReceipt {
    if (
      intent.destination === "tasks" ||
      intent.destination === "check-in" ||
      (intent.destination === "parking" && intent.source === "navigation") ||
      (intent.destination === "retrieval" && intent.source === "navigation") ||
      intent.destination === "shift"
    ) {
      this.destination = intent.destination;
      return "resolved";
    }
    this.destination = "tasks";
    return "rejected";
  }
}

function authorityKey(
  authGeneration: number,
  scope: EmployeeOperationalScope,
): string {
  return [
    authGeneration,
    scope.membershipId,
    scope.organizationId,
    scope.locationId,
    scope.shiftId,
  ].join(":");
}
