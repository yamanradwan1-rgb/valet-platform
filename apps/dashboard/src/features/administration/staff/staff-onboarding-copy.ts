const copy = {
  en: {
    create: "Create Employee",
    first: "First name",
    last: "Last name",
    pending: "Invite pending",
    generated: "Invite link generated",
    copy: "Copy link",
    copied: "Link copied",
    copyFailed: "Could not copy the link. Try again.",
    resend: "Resend invite",
    unavailable:
      "Onboarding is pending. The original link is unavailable. Generate a new link explicitly to share it.",
    expires: "Invitation expires",
    expired: "Invitation expired",
    revoked: "Invitation revoked",
    generation: "Invitation generation",
    locations: "Select 1–50 Locations",
    invalid: "Check the employee details and select 1–50 Locations.",
    actionFailed:
      "Could not complete this action. Check your access and try again.",
    activate: "Activate account",
    guidance:
      "Enter your VAYLET password. If this is your first VAYLET account, choose a password. If you already have an account, enter your existing password.",
    passwordPolicy:
      "A new password must contain 15–128 characters, without line breaks.",
    complete: "Activation complete",
    signIn: "Sign in",
    failed:
      "Activation could not be completed. Check your password or request a new invitation link.",
    rateLimited: "Too many attempts. Please wait before trying again.",
    missing: "Open the original invitation link to activate your account.",
    password: "Password",
    close: "Close",
    loading: "Loading…",
    role: "Role",
    email: "Email",
  },
  ar: {
    create: "إنشاء موظف",
    first: "الاسم الأول",
    last: "اسم العائلة",
    pending: "دعوة بانتظار التفعيل",
    generated: "تم إنشاء رابط الدعوة",
    copy: "نسخ الرابط",
    copied: "تم نسخ الرابط",
    copyFailed: "تعذر نسخ الرابط. حاول مرة أخرى.",
    resend: "إعادة إنشاء الدعوة",
    unavailable:
      "التفعيل قيد الانتظار. الرابط الأصلي غير متاح. أنشئ رابطاً جديداً لمشاركته.",
    expires: "انتهاء صلاحية الدعوة",
    expired: "انتهت صلاحية الدعوة",
    revoked: "أُلغيت الدعوة",
    generation: "إصدار الدعوة",
    locations: "اختر من ١ إلى ٥٠ موقعاً",
    invalid: "تحقق من بيانات الموظف واختر من ١ إلى ٥٠ موقعاً.",
    actionFailed: "تعذر إكمال الإجراء. تحقق من صلاحية الوصول وحاول مجدداً.",
    activate: "تفعيل الحساب",
    guidance:
      "أدخل كلمة مرور VAYLET. إذا كان هذا أول حساب لك، اختر كلمة مرور. إذا كان لديك حساب، أدخل كلمة مرورك الحالية.",
    passwordPolicy:
      "يجب أن تحتوي كلمة المرور الجديدة على ١٥ إلى ١٢٨ حرفاً، دون فواصل أسطر.",
    complete: "اكتمل التفعيل",
    signIn: "تسجيل الدخول",
    failed: "تعذر إكمال التفعيل. تحقق من كلمة المرور أو اطلب رابط دعوة جديداً.",
    rateLimited: "محاولات كثيرة. انتظر قبل المحاولة مجدداً.",
    missing: "افتح رابط الدعوة الأصلي لتفعيل حسابك.",
    password: "كلمة المرور",
    close: "إغلاق",
    loading: "جارٍ التحميل…",
    role: "الدور",
    email: "البريد الإلكتروني",
  },
};

export function staffOnboardingCopy(locale: "en" | "ar") {
  return copy[locale];
}
