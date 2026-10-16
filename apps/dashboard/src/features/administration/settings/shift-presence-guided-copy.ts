import type { DashboardLocale } from "../../../lib/i18n/locale";

/** Guided setup only. Labels describe proposed state, never infer a server commit. */
const guidedMessages = {
  title: ["Set up Shift Presence", "إعداد التحقق من الحضور للمناوبة"],
  intro: [
    "Review the exact Location and saved zones, stage policy changes, then explicitly review, confirm and apply.",
    "راجع الموقع المحدد ومناطق الحضور المحفوظة، ثم جهّز تغييرات السياسة وراجعها وأكّدها وطبّقها صراحةً.",
  ],
  scopeStep: ["Scope", "النطاق"],
  zonesStep: ["Zones", "المناطق"],
  policyStep: ["Policy", "السياسة"],
  reviewStep: ["Review and apply", "المراجعة والتطبيق"],
  scopeTitle: ["Authorized Location", "الموقع المخوّل"],
  scopeHelp: [
    "Check the selected Company and exact Location before editing. Switching scope discards this scope's unsaved drafts.",
    "تحقق من الشركة والموقع المحدد قبل التعديل. يزيل تغيير النطاق المسودات غير المحفوظة الخاصة به.",
  ],
  companyScope: ["Company", "الشركة"],
  locationScope: ["Location", "الموقع"],
  checkAtActionsOnly: [
    "Presence is checked at Shift Start or End only; this setup does not enable continuous staff tracking.",
    "يُتحقق من الحضور عند بدء المناوبة أو إنهائها فقط؛ ولا يفعّل هذا الإعداد تتبع الموظفين المستمر.",
  ],
  zonesHelp: [
    "Save each attendance zone individually. A marker or circle on the map is not saved until its own Save succeeds.",
    "احفظ كل منطقة حضور بشكل مستقل. علامة الخريطة أو دائرتها ليست محفوظة حتى ينجح حفظ المنطقة نفسها.",
  ],
  policyHelp: [
    "Stage each of four independent fields. Leaving this step does not save or clear any override.",
    "جهّز كل حقل من الحقول الأربعة المستقلة. مغادرة هذه الخطوة لا تحفظ أي تخصيص ولا تزيله.",
  ],
  stagedOnly: [
    "Draft only — no policy write has been requested.",
    "مسودة فقط — لم يُطلب حفظ أي سياسة.",
  ],
  reviewTitle: ["Review proposed policy", "مراجعة السياسة المقترحة"],
  reviewHelp: [
    "Compare saved and proposed values and inheritance sources for each field before confirmation.",
    "قارن القيم المحفوظة والمقترحة ومصادر الوراثة لكل حقل قبل التأكيد.",
  ],
  savedVsProposed: ["Saved versus proposed", "المحفوظ مقابل المقترح"],
  setting: ["Policy field", "حقل السياسة"],
  savedValue: ["Server-saved value", "القيمة المحفوظة على الخادم"],
  proposedValue: ["Proposed value", "القيمة المقترحة"],
  savedSource: ["Saved source", "المصدر المحفوظ"],
  proposedSource: ["Proposed source", "المصدر المقترح"],
  inherit: ["Inherit Company default", "وراثة قيمة الشركة الافتراضية"],
  custom: ["Custom Location override", "تخصيص للموقع"],
  unchanged: ["Unchanged", "دون تغيير"],
  noChanges: ["No policy changes to apply.", "لا توجد تغييرات سياسة لتطبيقها."],
  unsaved: ["Unsaved proposal", "مقترح غير محفوظ"],
  pendingFields: ["Fields awaiting apply", "الحقول التي تنتظر التطبيق"],
  invalidDraft: [
    "One or more proposed values are invalid. Return to Policy to correct them; nothing was saved.",
    "توجد قيمة مقترحة غير صالحة. عد إلى السياسة لتصحيحها؛ لم يُحفظ شيء.",
  ],
  staleDraft: [
    "Saved values or their source changed since editing began. Refresh and review before proceeding.",
    "تغيّرت القيم المحفوظة أو مصادرها منذ بدء التعديل. حدّث البيانات وراجعها قبل المتابعة.",
  ],
  contextChanged: [
    "The Company policy revision or configuration fingerprint changed. Stop and review the new server state.",
    "تغيّر رقم مراجعة سياسة الشركة أو بصمة التهيئة. أوقف التطبيق وراجع حالة الخادم الجديدة.",
  ],
  strictZoneHint: [
    "Before strict Start or End, save a usable active attendance zone. The server decides readiness.",
    "قبل فرض التحقق عند البدء أو الإنهاء، احفظ منطقة حضور نشطة وصالحة. الخادم هو من يحدد الجاهزية.",
  ],
  strictRisk: [
    "Strict presence can prevent employees from starting or ending a Shift when valid, fresh evidence is unavailable.",
    "قد يمنع التحقق الإلزامي الموظفين من بدء المناوبة أو إنهائها إذا لم تتوفر قراءة صالحة وحديثة.",
  ],
  strictApproval: [
    "Require or override permits only a separately approved exact exception. Approval alone never starts or ends a Shift.",
    "يسمح «مطلوب أو موافقة» باستثناء معتمد للإجراء المحدد فقط. الموافقة وحدها لا تبدأ المناوبة ولا تنهيها.",
  ],
  strictStart: ["Strict Start check proposed", "تحقق إلزامي مقترح عند البدء"],
  strictEnd: ["Strict End check proposed", "تحقق إلزامي مقترح عند الإنهاء"],
  offOffSafe: [
    "Start Off and End Off require no attendance zone to save this policy.",
    "إيقاف التحقق عند البدء والإنهاء لا يتطلب منطقة حضور لحفظ هذه السياسة.",
  ],
  preflight: ["Refresh server state", "تحديث حالة الخادم"],
  preflightHelp: [
    "Before every protected field write, re-read the exact scope, saved revisions and readiness. Never assume an earlier check is still valid.",
    "قبل حفظ كل حقل محمي، أعد قراءة النطاق المحدد والمراجعات المحفوظة والجاهزية. لا تفترض استمرار صلاحية فحص سابق.",
  ],
  reviewButton: ["Review changes", "مراجعة التغييرات"],
  confirmTitle: ["Confirm proposed changes", "تأكيد التغييرات المقترحة"],
  confirmHelp: [
    "Confirmation authorizes independent field attempts, not an all-or-nothing save. Some fields may remain unsaved.",
    "يسمح التأكيد بمحاولات حفظ مستقلة للحقول، وليس حفظًا شاملًا. قد تبقى بعض الحقول غير محفوظة.",
  ],
  confirmStrict: [
    "I understand that strict Start or End may block a Shift action if server readiness or valid presence fails.",
    "أفهم أن فرض التحقق عند البدء أو الإنهاء قد يمنع الإجراء عند فشل الجاهزية أو تعذر إثبات الحضور الصالح.",
  ],
  confirmButton: ["Confirm changes", "تأكيد التغييرات"],
  applyButton: ["Apply confirmed changes", "تطبيق التغييرات المؤكدة"],
  applying: ["Applying independent changes…", "جارٍ تطبيق التغييرات المستقلة…"],
  committed: ["Confirmed saved by server", "أكد الخادم الحفظ"],
  notCommitted: ["Not saved", "لم يُحفظ"],
  applyComplete: [
    "Every requested field was confirmed saved. Review the refreshed server state.",
    "أكد الخادم حفظ كل حقل مطلوب. راجع حالة الخادم المحدّثة.",
  ],
  partial: ["Partially applied", "طُبّق جزء من التغييرات"],
  partialHelp: [
    "Only confirmed fields are saved. Remaining proposals are unsaved; review the exact outcome before any new attempt.",
    "الحقول المؤكدة فقط محفوظة. بقيت المقترحات الأخرى غير محفوظة؛ راجع النتيجة المحددة قبل أي محاولة جديدة.",
  ],
  unknown: ["Save outcome unknown", "نتيجة الحفظ غير معروفة"],
  unknownHelp: [
    "Stop writes. Reconcile the original mutation ID read-only; do not issue the same protected request again.",
    "أوقف الحفظ. تحقّق من نتيجة معرّف العملية الأصلي دون تعديل؛ ولا ترسل الطلب المحمي نفسه مجددًا.",
  ],
  conflict: ["Revision conflict", "تعارض رقم المراجعة"],
  conflictHelp: [
    "Stop applying. Another saved value or source won; refresh, compare and confirm a new proposal explicitly.",
    "أوقف التطبيق. تغيّرت قيمة محفوظة أو مصدرها؛ حدّث البيانات وقارنها ثم أكّد مقترحًا جديدًا صراحةً.",
  ],
  mfaRequired: ["MFA required", "التحقق متعدد العوامل مطلوب"],
  mfaHelp: [
    "Complete verification, refresh the authoritative state and reconfirm. Do not automatically retry this write.",
    "أكمل التحقق، وحدّث الحالة المعتمدة ثم أعد التأكيد. لا تُعِد محاولة الحفظ تلقائيًا.",
  ],
  denied: ["Access denied", "الوصول غير مصرح به"],
  deniedHelp: [
    "Stop applying. Your Company or exact Location authority is unavailable; do not keep using these drafts.",
    "أوقف التطبيق. لم تعد صلاحيتك للشركة أو الموقع المحدد متاحة؛ لا تواصل استخدام هذه المسودات.",
  ],
  serverNotReady: [
    "Server readiness blocked this change",
    "منعت جاهزية الخادم هذا التغيير",
  ],
  serverNotReadyHelp: [
    "The server did not accept this configuration. Check saved active zones and refreshed readiness before reconsidering strict mode.",
    "لم يقبل الخادم هذه التهيئة. افحص مناطق الحضور النشطة المحفوظة والجاهزية المحدّثة قبل إعادة النظر في الوضع الإلزامي.",
  ],
  retryAfterRefresh: [
    "Review refreshed state before retry",
    "راجع الحالة المحدّثة قبل إعادة المحاولة",
  ],
  reconcile: ["Check original result", "التحقق من النتيجة الأصلية"],
  reconcileHelp: [
    "Result lookup is read-only and must use the original mutation ID and exact target. It never replays a write.",
    "الاستعلام عن النتيجة للقراءة فقط وبمعرّف العملية الأصلي والهدف المحدد؛ ولا يعيد تنفيذ الحفظ.",
  ],
  stopNoReplay: [
    "Stopped — no automatic replay or implied success.",
    "توقف التطبيق — لا إعادة تنفيذ تلقائية ولا افتراض للنجاح.",
  ],
  cancel: ["Cancel", "إلغاء"],
  close: ["Close", "إغلاق"],
  previous: ["Previous step", "الخطوة السابقة"],
  next: ["Next step", "الخطوة التالية"],
  backToPolicy: ["Back to policy", "العودة إلى السياسة"],
  backToOverview: ["Back to overview", "العودة إلى النظرة العامة"],
  refresh: ["Refresh", "تحديث"],
  requiredZone: [
    "Saved active zone required for strict mode",
    "يلزم وجود منطقة حضور نشطة محفوظة للوضع الإلزامي",
  ],
  serverTruth: [
    "Only server-confirmed data is saved state. A draft, pending request or step completion is not proof of saving.",
    "حالة الحفظ هي البيانات المؤكدة من الخادم فقط. المسودة أو الطلب المعلّق أو إتمام خطوة ليست دليلًا على الحفظ.",
  ],
  scopeReset: [
    "Scope changed — unsaved draft cleared",
    "تغيّر النطاق — أزيلت المسودة غير المحفوظة",
  ],
  noAggregateSave: [
    "Changes are independent per field, with original mutation IDs, revision checks and MFA where required.",
    "التغييرات مستقلة لكل حقل، بمعرّفات العمليات الأصلية والتحقق من المراجعات والمصادقة الإضافية عند الحاجة.",
  ],
  notStarted: ["Not submitted", "لم يُرسل"],
  cannotConfirm: [
    "Resolve invalid, stale or unknown state before confirming",
    "عالج الحالة غير الصالحة أو القديمة أو مجهولة النتيجة قبل التأكيد",
  ],
  compareChanged: [
    "Server state changed during review",
    "تغيّرت حالة الخادم أثناء المراجعة",
  ],
} as const satisfies Record<string, readonly [string, string]>;

export type GuidedPresenceCopyKey = keyof typeof guidedMessages;

export function guidedPresenceCopy(locale: DashboardLocale) {
  return (key: GuidedPresenceCopyKey): string =>
    guidedMessages[key][locale === "ar" ? 1 : 0];
}
