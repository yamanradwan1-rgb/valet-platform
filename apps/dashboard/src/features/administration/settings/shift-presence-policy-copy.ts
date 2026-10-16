import type { DashboardLocale } from "../../../lib/i18n/locale";

const copy = {
  modesHeading: ["Start and end of the shift", "بدء المناوبة وإنهاؤها"],
  modesIntro: [
    "Configure each action independently. A change here does not change the other action or track staff between shifts.",
    "اضبط كل إجراء بصورة مستقلة. لا يغيّر هذا الإعداد الإجراء الآخر ولا يتتبّع الموظفين بين المناوبات.",
  ],
  companyIntro: [
    "Company defaults apply only where the Location has no override. Each field is saved separately.",
    "تنطبق قيم الشركة الافتراضية فقط عندما لا يوجد تخصيص للموقع. يُحفظ كل حقل بصورة مستقلة.",
  ],
  locationIntro: [
    "Every field inherits its Company value unless this Location saves an override. Clearing one override does not change the others.",
    "يرث كل حقل قيمة الشركة ما لم يُحفظ تخصيص لهذا الموقع. إزالة تخصيص حقل لا تغيّر بقية الحقول.",
  ],
  advancedHeading: ["Advanced · GPS evidence limits", "إعدادات متقدمة · حدود قراءة GPS"],
  advancedIntro: [
    "These limits govern a single foreground presence check. They do not enable continuous location collection and are inert when both actions are Off.",
    "تضبط هذه الحدود التحقق الواحد من الحضور أثناء استخدام التطبيق، ولا تفعّل جمع الموقع المستمر، ولا تؤثر عندما يكون الإجراءان متوقفين.",
  ],
  savedOnServer: ["Saved on server", "المحفوظ على الخادم"],
  unsavedDraft: ["Unsaved draft", "مسودة غير محفوظة"],
  matchesSaved: ["No pending change", "لا يوجد تغيير معلّق"],
  inheritedNote: [
    "No Location override saved. Select a value, then Save to override this field only.",
    "لا يوجد تخصيص محفوظ للموقع. اختر قيمة ثم احفظ لتخصيص هذا الحقل وحده.",
  ],
  explicitOverrideNote: [
    "This Location has its own saved value. Clear Override restores inheritance for this field only.",
    "لهذا الموقع قيمة محفوظة خاصة به. إزالة التخصيص تعيد وراثة هذا الحقل وحده.",
  ],
  strictWarning: [
    "Strict presence can prevent staff from completing this shift action. Save and verify active attendance zones first; the server decides readiness at submission.",
    "قد يمنع التحقق الإلزامي الموظفين من إتمام هذا الإجراء. احفظ مناطق حضور نشطة وتحقق منها أولًا؛ يقرر الخادم الجاهزية عند الإرسال.",
  ],
  strictCompany: [
    "A stricter Company default also affects Locations that inherit this field. Review affected Locations before confirming.",
    "تؤثر قيمة الشركة الإلزامية أيضًا على المواقع التي ترث هذا الحقل. راجع المواقع المتأثرة قبل التأكيد.",
  ],
  confirmStrict: ["Confirm this strict change", "تأكيد هذا التغيير الإلزامي"],
  confirmClear: ["Confirm inherited strict value", "تأكيد القيمة الإلزامية الموروثة"],
  strictConfirmation: [
    "This is a confirmation of your intended change, not a claim it has been saved. Server validation, authorization and MFA still apply.",
    "هذا تأكيد للتغيير المطلوب وليس إشعارًا بأنه حُفظ. يظل التحقق والصلاحيات والمصادقة الإضافية من مسؤولية الخادم.",
  ],
  OFF: ["No presence check for this action; it is not blocked by GPS.", "لا يُطلب تحقق حضور لهذا الإجراء ولا يمنعه GPS."],
  WARN_ONLY: ["Presence issues may warn, but never block this shift action.", "قد يظهر تنبيه عند تعذر التحقق، لكنه لا يمنع هذا الإجراء."],
  REQUIRE: ["Valid, fresh presence in an active saved zone is required; otherwise this action is blocked.", "يلزم حضور صالح وحديث داخل منطقة حضور نشطة محفوظة، وإلا يُمنع الإجراء."],
  REQUIRE_OR_OVERRIDE: ["Valid presence or a separately approved exact exception is required. Approval alone never starts or ends a shift.", "يلزم حضور صالح أو استثناء معتمد للإجراء المحدد. الموافقة وحدها لا تبدأ المناوبة ولا تنهيها."],
  accuracyEffect: ["The GPS uncertainty must not exceed this many meters.", "يجب ألا يتجاوز عدم يقين قراءة GPS هذا العدد من الأمتار."],
  ageEffect: ["The GPS reading must not be older than this many seconds.", "يجب ألا يتجاوز عمر قراءة GPS هذا العدد من الثواني."],
} as const;

export type PresencePolicyCopyKey = keyof typeof copy;

export function presencePolicyCopy(locale: DashboardLocale) {
  return (key: PresencePolicyCopyKey): string => copy[key][locale === "ar" ? 1 : 0];
}
