export const FOUNDATION_LOCALES = ["en", "ar"] as const;

export type FoundationLocale = (typeof FOUNDATION_LOCALES)[number];

type FoundationDirection = "ltr" | "rtl";
type FoundationTextAlign = "left" | "right";

interface FoundationCopy {
  appName: string;
  audience: string;
  status: string;
  chooseLanguage: string;
  english: string;
  arabic: string;
}

interface FoundationPresentation {
  copy: FoundationCopy;
  direction: FoundationDirection;
  textAlign: FoundationTextAlign;
}

const FOUNDATION_COPY: Record<FoundationLocale, FoundationCopy> = {
  en: {
    appName: "VAYLET",
    audience: "Employee",
    status: "Foundation ready",
    chooseLanguage: "Choose language",
    english: "English",
    arabic: "Arabic",
  },
  ar: {
    appName: "VAYLET",
    audience: "الموظف",
    status: "جاهز للتشغيل",
    chooseLanguage: "اختر اللغة",
    english: "الإنجليزية",
    arabic: "العربية",
  },
};

export function getFoundationPresentation(
  locale: FoundationLocale,
): FoundationPresentation {
  const isArabic = locale === "ar";
  return {
    copy: FOUNDATION_COPY[locale],
    direction: isArabic ? "rtl" : "ltr",
    textAlign: isArabic ? "right" : "left",
  };
}
