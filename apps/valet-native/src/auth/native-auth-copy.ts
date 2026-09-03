import type { FoundationLocale } from "../foundation/foundation-locale";

export interface NativeAuthCopy {
  readonly authenticated: string;
  readonly email: string;
  readonly fatal: string;
  readonly login: string;
  readonly loginFailed: string;
  readonly logout: string;
  readonly password: string;
  readonly restoring: string;
  readonly retry: string;
  readonly transient: string;
}

const copy: Record<FoundationLocale, NativeAuthCopy> = {
  en: {
    authenticated: "Secure employee session active",
    email: "Email",
    fatal: "Secure authentication is unavailable. Protected work is blocked.",
    login: "Sign in",
    loginFailed: "Sign-in was not completed. Check your details and try again.",
    logout: "Log out",
    password: "Password",
    restoring: "Restoring secure session…",
    retry: "Retry restoration",
    transient:
      "Session restoration is temporarily unavailable. Your secure session was not discarded.",
  },
  ar: {
    authenticated: "جلسة الموظف الآمنة نشطة",
    email: "البريد الإلكتروني",
    fatal: "المصادقة الآمنة غير متاحة. تم حظر العمل المحمي.",
    login: "تسجيل الدخول",
    loginFailed: "لم يكتمل تسجيل الدخول. تحقق من البيانات وحاول مرة أخرى.",
    logout: "تسجيل الخروج",
    password: "كلمة المرور",
    restoring: "جارٍ استعادة الجلسة الآمنة…",
    retry: "إعادة محاولة الاستعادة",
    transient: "استعادة الجلسة غير متاحة مؤقتًا. لم يتم حذف جلستك الآمنة.",
  },
};

export function getNativeAuthCopy(locale: FoundationLocale): NativeAuthCopy {
  return copy[locale];
}
