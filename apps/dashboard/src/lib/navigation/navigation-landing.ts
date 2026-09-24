import type { DashboardNavigationItem } from "./navigation-types";

export type RootProductLandingDecision =
  | { readonly kind: "fallback" }
  | { readonly kind: "redirect"; readonly href: string }
  | { readonly kind: "wait" };

export function firstMainNavigationHref(
  navigation: readonly DashboardNavigationItem[],
): string | null {
  return navigation.find((item) => item.placement === "MAIN")?.href ?? null;
}

export function resolveRootProductLanding(
  status: "checking" | "error" | "valid",
  navigation: readonly DashboardNavigationItem[],
): RootProductLandingDecision {
  if (status === "checking") return { kind: "wait" };
  if (status === "error") return { kind: "fallback" };
  const href = firstMainNavigationHref(navigation);
  return href === null ? { kind: "fallback" } : { href, kind: "redirect" };
}
