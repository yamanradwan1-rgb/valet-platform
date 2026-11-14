import type { FoundationLocale } from "../../foundation/foundation-locale";

// These are visual demo variants, never server status or accepted retry policy.
export const whatsAppDemoStates = [
  "default",
  "pressed",
  "loading",
  "queued",
  "accepted",
  "failed",
  "unknown",
  "delivered",
  "disabled",
] as const;
export type WhatsAppDemoState = (typeof whatsAppDemoStates)[number];

export function parseWhatsAppDemoState(value: unknown): WhatsAppDemoState {
  return typeof value === "string" &&
    whatsAppDemoStates.some((state) => state === value)
    ? (value as WhatsAppDemoState)
    : "default";
}

const labels = {
  en: {
    default: "Send via WhatsApp",
    pressed: "Send via WhatsApp",
    loading: "Sending…",
    queued: "Queued by VAYLET",
    accepted: "Meta accepted",
    failed: "Failed",
    unknown: "Outcome unknown",
    delivered: "Delivered",
    disabled: "Unavailable",
  },
  ar: {
    default: "إرسال عبر واتساب",
    pressed: "إرسال عبر واتساب",
    loading: "جاري الإرسال…",
    queued: "في قائمة إرسال VAYLET",
    accepted: "قبلت Meta الطلب",
    failed: "تعذّر الإرسال",
    unknown: "نتيجة الإرسال غير معروفة",
    delivered: "تم التسليم",
    disabled: "الإرسال غير متاح",
  },
} satisfies Record<FoundationLocale, Record<WhatsAppDemoState, string>>;

export function getWhatsAppDemoCopy(
  locale: FoundationLocale,
  state: WhatsAppDemoState,
) {
  return {
    label: labels[locale][state],
    accessibilityLabel: `${locale === "ar" ? "واتساب" : "WhatsApp"} · ${labels[locale][state]}`,
    hint:
      state === "delivered"
        ? locale === "ar"
          ? "عرض تصميم فقط. لا يتم إرسال أي رسالة. التسليم المعروض محاكاة وليس دليلاً من مزود الخدمة."
          : "Design demonstration only. No message is sent. Displayed delivery is simulated, not provider evidence."
        : state === "loading" || state === "disabled"
          ? locale === "ar"
            ? "عرض تصميم فقط. لا يتم إرسال أي رسالة. التحكم غير متاح حالياً."
            : "Design demonstration only. No message is sent. Control currently unavailable."
          : locale === "ar"
            ? "عرض تصميم فقط. لا يتم إرسال أي رسالة. اضغط لاستعراض الحالة التالية."
            : "Design demonstration only. No message is sent. Tap to preview the next state.",
  };
}

export function nextWhatsAppDemoState(
  state: WhatsAppDemoState,
): WhatsAppDemoState {
  switch (state) {
    case "default":
    case "pressed":
      return "loading";
    case "loading":
      return "queued";
    case "queued":
      return "accepted";
    case "accepted":
      return "failed";
    case "failed":
      return "unknown";
    case "unknown":
      return "delivered";
    case "delivered":
      return "default";
    case "disabled":
      return "disabled";
  }
}
