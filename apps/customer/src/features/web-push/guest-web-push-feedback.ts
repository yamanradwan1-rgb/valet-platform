import { GuestApiError } from "../../lib/api/api-error";
import type { GuestWebPushLocale } from "./guest-web-push-copy";
import {
  GuestWebPushStageError,
  GuestWebPushTimeoutError,
} from "./guest-web-push-stage";

const COPY = {
  DISMISSED: [
    "No permission given. Tap Enable to retry.",
    "لم تمنح الإذن. اضغط تفعيل للمحاولة.",
  ],
  DENIED: [
    "Notifications blocked. Check browser settings.",
    "الإشعارات محظورة. راجع إعدادات المتصفح.",
  ],
  UNSUPPORTED: [
    "Use a browser that supports notifications.",
    "استخدم متصفحًا يدعم الإشعارات.",
  ],
  INSECURE: [
    "Open a secure HTTPS link to enable alerts.",
    "افتح رابط HTTPS آمنًا لتفعيل الإشعارات.",
  ],
  PERMISSION: [
    "Permission unavailable. Check browser settings.",
    "تعذّر طلب الإذن. راجع إعدادات المتصفح.",
  ],
  WORKER: [
    "Alert setup failed. Tap Enable to retry.",
    "تعذّر إعداد الإشعارات. حاول التفعيل مجددًا.",
  ],
  WORKER_TIMEOUT: [
    "Alert setup timed out. Tap Enable to retry.",
    "انتهت مهلة الإعداد. حاول التفعيل مجددًا.",
  ],
  CONFIG: [
    "Alerts unavailable. Try enabling again later.",
    "الإشعارات غير متاحة. حاول التفعيل لاحقًا.",
  ],
  SUBSCRIPTION: [
    "Alert subscription failed. Try enabling again.",
    "تعذّر الاشتراك. حاول التفعيل مجددًا.",
  ],
  OFFLINE: [
    "Check your connection, then tap Enable.",
    "تحقّق من اتصالك ثم اضغط تفعيل.",
  ],
  TIMEOUT: [
    "Setup timed out. Tap Enable to retry.",
    "انتهت المهلة. حاول التفعيل مجددًا.",
  ],
  AUTH: [
    "Visit access unavailable. Refresh this page.",
    "وصول الزيارة غير متاح. حدّث الصفحة.",
  ],
  RATE_LIMITED: [
    "Too many attempts. Wait, then tap Enable.",
    "محاولات كثيرة. انتظر ثم اضغط تفعيل.",
  ],
  SERVER: [
    "Service unavailable. Try enabling again later.",
    "الخدمة غير متاحة. حاول التفعيل لاحقًا.",
  ],
  CONFLICT: [
    "Visit setup changed. Refresh this page.",
    "تغيّر إعداد الزيارة. حدّث الصفحة.",
  ],
  CONTEXT: [
    "Visit changed. Refresh before enabling alerts.",
    "تغيّرت الزيارة. حدّث الصفحة قبل التفعيل.",
  ],
  UNKNOWN: [
    "Activation unconfirmed. Tap Enable to check.",
    "التفعيل غير مؤكد. اضغط تفعيل للتحقّق.",
  ],
  CANCELLED: [
    "Setup cancelled. Tap Enable to retry.",
    "أُلغي الإعداد. حاول التفعيل مجددًا.",
  ],
  FAILED: [
    "Could not enable alerts. Tap Enable to retry.",
    "تعذّر التفعيل. حاول مجددًا.",
  ],
} as const;

export type GuestPushFeedbackKind = keyof typeof COPY;
export interface GuestPushFeedback {
  readonly kind: GuestPushFeedbackKind;
  readonly retryAfter?: number | undefined;
}

export function guestPushFeedbackCopy(
  locale: GuestWebPushLocale,
  kind: GuestPushFeedbackKind,
): string {
  return COPY[kind][locale === "ar" ? 1 : 0];
}

export function classifyGuestPushFailure(
  error: unknown,
  fallback: GuestPushFeedbackKind = "FAILED",
): GuestPushFeedback {
  if (error instanceof GuestApiError) {
    if (error.code === "MUTATION_OUTCOME_UNKNOWN") return { kind: "UNKNOWN" };
    if (error.code === "GUEST_CONTEXT_CHANGED") return { kind: "CONTEXT" };
    if (error.code === "GUEST_REQUEST_CANCELLED") return { kind: "CANCELLED" };
    if (error.status === 401 || error.status === 403) return { kind: "AUTH" };
    if (error.status === 409) return { kind: "CONFLICT" };
    if (error.status === 429)
      return { kind: "RATE_LIMITED", retryAfter: error.retryAfter };
    if (error.status >= 500) return { kind: "SERVER" };
    if (error.code === "REQUEST_TIMEOUT") return { kind: "TIMEOUT" };
    if (error.isNetworkError) return { kind: "OFFLINE" };
  }
  if (
    error instanceof GuestWebPushTimeoutError ||
    error instanceof GuestWebPushStageError
  ) {
    if (error.stage === "server registration") return { kind: "UNKNOWN" };
    if (error instanceof GuestWebPushTimeoutError) {
      return {
        kind: error.stage === "service worker" ? "WORKER_TIMEOUT" : "TIMEOUT",
      };
    }
    if (error.stage === "permission") return { kind: "PERMISSION" };
    if (error.stage === "service worker") return { kind: "WORKER" };
    if (error.stage === "public key") return { kind: "CONFIG" };
    return { kind: "SUBSCRIPTION" };
  }
  if (error instanceof Error && error.name === "AbortError")
    return { kind: "CANCELLED" };
  return { kind: fallback };
}
