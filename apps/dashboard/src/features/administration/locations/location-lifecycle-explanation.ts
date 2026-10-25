import type { ManagementLocationLifecycleResponse } from "@valet/contracts";

export function locationLifecycleExplanation(
  location: ManagementLocationLifecycleResponse,
  locale: "en" | "ar",
) {
  const ar = locale === "ar";
  if (location.status === "INACTIVE") {
    if (!location.readiness.readyForActivation) {
      return ar
        ? "التفعيل غير متاح حتى اكتمال متطلبات الجاهزية."
        : "Activation is unavailable until readiness requirements are complete.";
    }
    return ar
      ? "التفعيل يعيد فتح استقبال المركبات الجديدة."
      : "Activation reopens intake for new vehicles.";
  }
  if (location.acceptingIntake)
    return ar
      ? "أوقف الاستقبال أولًا قبل إلغاء التفعيل."
      : "Stop intake before deactivation.";
  const blockers = [
    location.drain.activeShiftPresent
      ? ar
        ? "وردية نشطة"
        : "active shift"
      : null,
    location.drain.nonCompletedValetSessionPresent
      ? ar
        ? "جلسة غير مكتملة"
        : "unfinished session"
      : null,
    location.drain.nonTerminalTaskPresent
      ? ar
        ? "مهمة غير نهائية"
        : "non-terminal task"
      : null,
  ].filter(Boolean);
  return blockers.length
    ? (ar ? "إلغاء التفعيل محظور بسبب: " : "Deactivation blocked by: ") +
        blockers.join(ar ? "، " : ", ")
    : null;
}
