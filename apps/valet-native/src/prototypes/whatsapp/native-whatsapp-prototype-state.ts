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
    default: "Demo · Send via WhatsApp",
    pressed: "Demo · Send via WhatsApp",
    loading: "Demo · Requesting…",
    queued: "Demo · Queued by VAYLET",
    accepted: "Demo · Meta accepted",
    failed: "Demo · Failed",
    unknown: "Demo · Outcome unknown",
    delivered: "Demo · Delivered (webhook)",
    disabled: "Demo · Unavailable",
  },
  ar: {
    default: "تجريبي · إرسال عبر واتساب",
    pressed: "تجريبي · إرسال عبر واتساب",
    loading: "تجريبي · جارٍ الطلب…",
    queued: "تجريبي · في قائمة VAYLET",
    accepted: "تجريبي · قبلت Meta الطلب",
    failed: "تجريبي · تعذّر الإرسال",
    unknown: "تجريبي · النتيجة غير معروفة",
    delivered: "تجريبي · تم التسليم (ويب هوك)",
    disabled: "تجريبي · غير متاح",
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
      state === "loading" || state === "disabled"
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
