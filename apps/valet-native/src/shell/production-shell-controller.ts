import type {
  EmployeeOperationalScope,
  EmployeeOperationalSnapshot,
  NativeAuthSnapshot,
} from "@valet/employee-client";
import {
  parseProductionRouteIntent,
  productionRouteIsAllowed,
  type ProductionDestination,
  type ProductionRouteIntent,
} from "./production-route-intent";

export {
  parseProductionRouteIntent,
  productionRouteIntentFromParam,
  type ProductionDestination,
  type ProductionIntentSource,
  type ProductionRouteIntent,
} from "./production-route-intent";

type ActiveProductionDestination = ProductionDestination;

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
      readonly count: number | null;
      readonly kind: "operational-error";
      readonly reason: "ambiguous-active-shifts";
    }
  | {
      readonly kind: "operational-error";
      readonly message: string | null;
      readonly reason: "unavailable";
    }
  | {
      readonly destination: ActiveProductionDestination;
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
    return {
      count: operations.activeShiftCount,
      kind: "operational-error",
      reason: "ambiguous-active-shifts",
    };
  }
  if (operations.phase !== "ready" || operations.scope === null) {
    return {
      kind: "operational-error",
      message: operations.contextFailure?.message ?? null,
      reason: "unavailable",
    };
  }
  return { kind: "active", scope: operations.scope };
}

export function productionShellStateRetiresOperationalAuthority(
  state: ReturnType<typeof deriveProductionShellState>,
): boolean {
  return (
    state.kind === "access-denied" ||
    state.kind === "no-active-shift" ||
    state.kind === "no-usable-location" ||
    (state.kind === "operational-error" &&
      state.reason === "ambiguous-active-shifts")
  );
}

export class ProductionShellController {
  private authority: ConfirmedAuthority | null = null;
  private authorityReady = false;
  private destination: ActiveProductionDestination = "tasks";
  private pending: PendingIntent | null = null;
  private routeRevision = 0;
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

  isActiveDestination(destination: ProductionDestination): boolean {
    return this.authorityReady && this.destination === destination;
  }

  captureRoute(destination: ProductionDestination): () => boolean {
    const revision = this.routeRevision;
    return () =>
      this.routeRevision === revision && this.isActiveDestination(destination);
  }

  back(): boolean {
    if (!this.authorityReady || this.destination === "tasks") return false;
    this.setDestination("tasks");
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
    this.setDestination("tasks");
    this.pending = null;
    if (this.purgeLatched) return;
    this.purgeLatched = true;
    this.purgeRevision += 1;
  }

  private resolveIntent(intent: ProductionRouteIntent): IntentReceipt {
    if (productionRouteIsAllowed(intent)) {
      this.setDestination(intent.destination);
      return "resolved";
    }
    this.setDestination("tasks");
    return "rejected";
  }

  private setDestination(destination: ProductionDestination): void {
    if (this.destination === destination) return;
    this.destination = destination;
    this.routeRevision += 1;
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
    scope.role,
  ].join(":");
}
