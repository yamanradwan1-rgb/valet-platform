import type { Variant } from "./types";

export function resolveAlertsPrototypeRoute(
  nodeEnvironment: string | undefined,
  prototype: string | string[] | undefined,
  variant: string | string[] | undefined,
): { readonly enabled: boolean; readonly variant: Variant } {
  return {
    enabled: nodeEnvironment !== "production" && prototype === "alerts",
    variant: variant === "b" ? "b" : "a",
  };
}
