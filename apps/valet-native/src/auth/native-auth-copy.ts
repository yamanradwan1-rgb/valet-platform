import type { FoundationLocale } from "../foundation/foundation-locale";

export interface NativeAuthCopy {
  readonly authenticated: string;
  readonly connectionIssue: string;
  readonly email: string;
  readonly fatal: string;
  readonly fatalTitle: string;
  readonly login: string;
  readonly loginFailed: string;
  readonly logout: string;
  readonly password: string;
  readonly restoring: string;
  readonly retry: string;
  readonly retrying: string;
  readonly signingIn: string;
  readonly staffSignIn: string;
  readonly transient: string;
}

const copy: Record<FoundationLocale, NativeAuthCopy> = {
  en: {
    authenticated: "Secure employee session active",
    connectionIssue: "Connection issue",
    email: "Work email",
    fatal: "Secure authentication is unavailable. Protected work is blocked.",
    fatalTitle: "Secure sign-in unavailable",
    login: "Sign In",
    loginFailed: "The operation failed. Refresh and try again.",
    logout: "Log out",
    password: "Password",
    restoring: "Checking staff session...",
    retry: "Retry",
    retrying: "Retrying…",
    signingIn: "Signing in…",
    staffSignIn: "Staff sign in",
    transient: "The staff sign-in service is temporarily unavailable.",
  },
  ar: {
    authenticated: "جلسة الموظف الآمنة نشطة",
    connectionIssue: "مشكلة في الاتصال",
    email: "البريد الإلكتروني الوظيفي",
    fatal: "المصادقة الآمنة غير متاحة. تم حظر العمل المحمي.",
    fatalTitle: "تسجيل الدخول الآمن غير متاح",
    login: "تسجيل الدخول",
    loginFailed: "تعذر تنفيذ العملية. حدّث الصفحة وحاول مجدداً.",
    logout: "تسجيل الخروج",
    password: "كلمة المرور",
    restoring: "جارٍ التحقق من جلسة الموظف...",
    retry: "إعادة المحاولة",
    retrying: "جارٍ إعادة المحاولة…",
    signingIn: "جارٍ تسجيل الدخول…",
    staffSignIn: "تسجيل دخول الموظفين",
    transient: "خدمة تسجيل دخول الموظفين غير متاحة مؤقتًا.",
  },
};

export function getNativeAuthCopy(locale: FoundationLocale): NativeAuthCopy {
  return copy[locale];
}
