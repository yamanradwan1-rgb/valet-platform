import type { MouseEvent } from "react";
import type { ManagementAlertItem } from "./alert-model";
import { alertSourceHref } from "./alert-source-intent";

/** Modified clicks retain native link behavior and MUST leave the dialog open. */
export function isOrdinaryAlertSourceClick(
  event: Pick<
    MouseEvent<HTMLAnchorElement>,
    "button" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey"
  >,
): boolean {
  return (
    event.button === 0 &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/** Preserve the existing Policies Studio native history ownership. */
export function navigateLegacyAlertSource(
  event: MouseEvent<HTMLAnchorElement>,
  item: ManagementAlertItem,
): void {
  if (!isOrdinaryAlertSourceClick(event)) return;
  if (
    item.sourceKind !== "PRESENCE" ||
    window.location.pathname !== "/policies"
  )
    return;
  event.preventDefault();
  window.history.pushState(window.history.state, "", alertSourceHref(item));
  window.dispatchEvent(new PopStateEvent("popstate"));
}
