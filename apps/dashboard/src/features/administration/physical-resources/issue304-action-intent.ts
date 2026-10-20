/**
 * UI intent only. The existing authenticated resource dialogs and API own
 * validation, management authority, MFA, idempotency and persisted outcomes.
 */
export type Issue304ResourceKind = "key-slot" | "parking-spot";

export type Issue304ActionIntent =
  | {
      readonly type: "create";
      readonly kind: Issue304ResourceKind;
      readonly scopeKey: string;
      readonly identityGeneration: number;
    }
  | {
      readonly type: "create-zone";
      readonly scopeKey: string;
      readonly identityGeneration: number;
    }
  | {
      readonly type: "label";
      readonly kind: Issue304ResourceKind;
      readonly resourceId: string;
      readonly scopeKey: string;
      readonly identityGeneration: number;
    };

export type Issue304CreatedResource =
  | { readonly type: "key-slot"; readonly resourceId: string }
  | { readonly type: "parking-spot"; readonly resourceId: string }
  | { readonly type: "parking-zone"; readonly resourceId: string };

/**
 * The management workspace must already have exact Location authority.
 * This only fences stale UI requests; the backend remains the authority.
 */
export function issue304ActionIsCurrent(
  action: Issue304ActionIntent | null,
  context: {
    readonly scopeKey: string;
    readonly identityGeneration: number;
    readonly locationStatus: "ACTIVE" | "INACTIVE";
    readonly managementAuthorized: boolean;
  },
): action is Issue304ActionIntent {
  return (
    action !== null &&
    context.managementAuthorized &&
    context.locationStatus === "ACTIVE" &&
    action.scopeKey === context.scopeKey &&
    action.identityGeneration === context.identityGeneration &&
    (action.type !== "label" || action.resourceId.length > 0)
  );
}
