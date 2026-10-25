import type { TaskOverviewEntry } from "@valet/contracts";
import { operationalStaffName } from "../operational-staff";

export function taskAssigneeName(item: TaskOverviewEntry, locale: "en" | "ar") {
  return item.status === "CANCELLED" &&
    item.assignee === null &&
    item.currentAssigneeMembershipId !== null
    ? locale === "ar"
      ? "موظف غير معروف"
      : "Unknown employee"
    : operationalStaffName(item.assignee, locale);
}

export function taskCancellerName(
  item: TaskOverviewEntry,
  locale: "en" | "ar",
) {
  if (item.cancellation?.kind === "GUEST")
    return locale === "ar" ? "الضيف" : "Guest";
  return (
    item.cancellation?.displayName ??
    (locale === "ar" ? "غير معروف" : "Unknown")
  );
}
