const copy = {
  en: {
    action: "Force End Shift",
    body: "End this shift administratively. Open tasks require handoff first. Cash reconciliation remains pending.",
    reason: "Reason",
    reasonHelp: "Enter a reason (1–500 characters).",
    invalid:
      "Enter a nonblank reason of at most 500 characters and confirm the administrative closure.",
    confirm: "I confirm this shift should be ended administratively.",
    cancel: "Cancel",
    close: "Close",
    submitting: "Ending shift…",
    mfa: "Complete verification, then review and click Force End Shift again.",
    retry:
      "Verification is complete. Review the shift and click Force End Shift again.",
    authRetry:
      "Authentication was refreshed. Review the shift and submit again explicitly.",
    unknown:
      "The outcome could not be confirmed. Do not assume the shift is still active. Refresh its status before reviewing a retry.",
    refresh: "Refresh status",
    retrySame: "Retry same operation",
    reviewed:
      "The refreshed shift is active. Review before explicitly retrying the same operation.",
    reconciling: "Refreshing authoritative shift history and detail…",
    blocked:
      "Open tasks require handoff before this shift can end. Resolve them in their operational workflow, then retry explicitly.",
    "ended-conflict":
      "This shift was already ended. Refresh its status to review the authoritative closure.",
    conflict:
      "The operation conflicts with an earlier request. Refresh the status and review your reason and confirmation.",
    failed:
      "This action could not be completed. Review your details and try again.",
    success:
      "Shift ended administratively. Cash reconciliation remains pending.",
    ended:
      "The refreshed shift is ended. No further Force End submission is available.",
    "success-read-failed":
      "Shift ended administratively; cash reconciliation remains pending. The status refresh could not be completed. Refresh again to review its detail.",
  },
  ar: {
    action: "إنهاء الوردية إدارياً",
    body: "إنهاء هذه الوردية إدارياً. يجب تسليم المهام المفتوحة أولاً. تبقى مطابقة النقد معلقة.",
    reason: "السبب",
    reasonHelp: "أدخل سبباً (من ١ إلى ٥٠٠ حرف).",
    invalid: "أدخل سبباً غير فارغ لا يتجاوز ٥٠٠ حرف وأكّد الإنهاء الإداري.",
    confirm: "أؤكد وجوب إنهاء هذه الوردية إدارياً.",
    cancel: "إلغاء",
    close: "إغلاق",
    submitting: "جارٍ إنهاء الوردية…",
    mfa: "أكمل التحقق ثم راجع الوردية واضغط إنهاء الوردية إدارياً مجدداً.",
    retry: "اكتمل التحقق. راجع الوردية واضغط إنهاء الوردية إدارياً مجدداً.",
    authRetry: "تم تحديث المصادقة. راجع الوردية ثم أعد الإرسال صراحةً.",
    unknown:
      "تعذر تأكيد النتيجة. لا تفترض أن الوردية ما زالت نشطة. حدّث حالتها قبل مراجعة إعادة المحاولة.",
    refresh: "تحديث الحالة",
    retrySame: "إعادة محاولة العملية نفسها",
    reviewed:
      "الوردية المحدّثة نشطة. راجعها قبل إعادة محاولة العملية نفسها صراحةً.",
    reconciling: "جارٍ تحديث سجل الوردية وتفاصيلها من المصدر المعتمد…",
    blocked:
      "تتطلب المهام المفتوحة تسليم المسؤولية قبل إنهاء الوردية. عالجها في مسار العمل التشغيلي ثم أعد المحاولة صراحةً.",
    "ended-conflict":
      "أُنهِيت هذه الوردية بالفعل. حدّث حالتها لمراجعة الإنهاء المعتمد.",
    conflict: "تتعارض العملية مع طلب سابق. حدّث الحالة وراجع السبب والتأكيد.",
    failed: "تعذر إكمال الإجراء. راجع البيانات وحاول مجدداً.",
    success: "أُنهِيت الوردية إدارياً. تبقى مطابقة النقد معلقة.",
    ended: "الوردية المحدّثة منتهية. لا يمكن إرسال طلب إنهاء إداري آخر.",
    "success-read-failed":
      "أُنهِيت الوردية إدارياً وتبقى مطابقة النقد معلقة. تعذر تحديث الحالة؛ حدّثها مجدداً لمراجعة التفاصيل.",
  },
};
export const staffForceEndCopy = (locale: "en" | "ar") => copy[locale];
