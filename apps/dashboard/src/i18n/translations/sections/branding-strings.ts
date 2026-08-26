/**
 * Branding surface strings (D4-004): display name + primary color,
 * Company default -> Location override presentation, optimistic-concurrency
 * conflict posture and per-setting labels. Feature-local fragment; keys are
 * deliberately disjoint from every other section (guarded by
 * sections/composition.test.ts).
 */

export interface BrandingStrings {
  /** Explains precedence and read-only company defaults for branding. */
  "branding.note": string;
  "branding.metadata.updatedAt": string;
  "branding.columns.setting": string;
  "branding.columns.companyDefault": string;
  "branding.columns.locationOverride": string;
  "branding.columns.applied": string;
  "branding.columns.actions": string;
  /** Row value shown when no location override exists. */
  "branding.override.absent": string;
  /** Marks the company-default column as intentionally read-only. */
  "branding.default.readOnly": string;
  "branding.actions.setOverride": string;
  "branding.actions.editOverride": string;
  "branding.actions.clearOverride": string;
  "branding.actions.cancel": string;
  "branding.state.loading": string;
  "branding.state.loadFailed": string;
  "branding.editor.titleSet": string;
  "branding.editor.titleEdit": string;
  "branding.editor.subtitle": string;
  "branding.editor.companyDefault": string;
  "branding.editor.currentOverride": string;
  "branding.editor.newValue": string;
  "branding.editor.save": string;
  "branding.editor.saving": string;
  "branding.editor.pickerLabel": string;
  "branding.hint.name": string;
  /**
   * Documents the deliberate client-side lowercase->UPPERCASE hex
   * normalization before contract validation (test-pinned in
   * branding-state.test.ts); the backend accepts uppercase only.
   */
  "branding.hint.color": string;
  "branding.validation.nameInvalid": string;
  "branding.validation.colorInvalid": string;
  "branding.clear.title": string;
  "branding.clear.body": string;
  "branding.clear.confirm": string;
  "branding.conflict.title": string;
  "branding.conflict.body": string;
  "branding.conflict.reload": string;
  "branding.errors.valueInvalid": string;
  "branding.setting.brandDisplayName": string;
  "branding.setting.brandPrimaryColor": string;
  "branding.description.brandDisplayName": string;
  "branding.description.brandPrimaryColor": string;
  "branding.preview.title": string;
  "branding.preview.captionName": string;
  "branding.preview.captionColor": string;
}

export const brandingEn: BrandingStrings = {
  "branding.note":
    "Company defaults apply everywhere and can be replaced for this location only by a location override. Defaults are read-only here.",
  "branding.metadata.updatedAt": "Branding updated",
  "branding.columns.setting": "Setting",
  "branding.columns.companyDefault": "Company default",
  "branding.columns.locationOverride": "Location override",
  "branding.columns.applied": "Applied value",
  "branding.columns.actions": "Actions",
  "branding.override.absent": "Using company default",
  "branding.default.readOnly": "Read-only",
  "branding.actions.setOverride": "Set override…",
  "branding.actions.editOverride": "Edit override…",
  "branding.actions.clearOverride": "Use company default…",
  "branding.actions.cancel": "Cancel",
  "branding.state.loading": "Loading location branding…",
  "branding.state.loadFailed":
    "The location branding could not be loaded. Check your connection and try again.",
  "branding.editor.titleSet": "Set a location override",
  "branding.editor.titleEdit": "Edit the location override",
  "branding.editor.subtitle":
    "The value applies to this location only and overrides the company default.",
  "branding.editor.companyDefault": "Company default",
  "branding.editor.currentOverride": "Current override value",
  "branding.editor.newValue": "New value for this location",
  "branding.editor.save": "Save override",
  "branding.editor.saving": "Saving…",
  "branding.editor.pickerLabel": "Pick a color",
  "branding.hint.name":
    "1 to 120 characters. Leading and trailing spaces are removed automatically.",
  "branding.hint.color":
    "Six hexadecimal digits with uppercase letters, like #176BFF. Lowercase letters are converted to uppercase automatically before saving.",
  "branding.validation.nameInvalid":
    "Enter a name of 1 to 120 characters; empty names and invisible control characters are not allowed.",
  "branding.validation.colorInvalid":
    "Enter a valid hexadecimal color such as #176BFF: a # followed by exactly six characters from 0-9 and A-F.",
  "branding.clear.title": "Use the company default for this setting?",
  "branding.clear.body":
    "The location override will be cleared and this location will follow the company default again. The company default itself cannot be changed here.",
  "branding.clear.confirm": "Clear override",
  "branding.conflict.title": "The branding changed elsewhere",
  "branding.conflict.body":
    "Your change was not saved: the location branding was updated by someone else at the same time and nothing was overwritten. Reload to review the latest saved values, then apply your change again deliberately.",
  "branding.conflict.reload": "Reload latest",
  "branding.errors.valueInvalid":
    "The entered value was not accepted. Check the format and requirements, then try again.",
  "branding.setting.brandDisplayName": "Display name",
  "branding.setting.brandPrimaryColor": "Primary color",
  "branding.description.brandDisplayName":
    "The name shown for this location. Without an override, the company name applies.",
  "branding.description.brandPrimaryColor":
    "The primary brand color as an uppercase hex code such as #176BFF.",
  "branding.preview.title": "Applied branding preview",
  "branding.preview.captionName": "Applied display name",
  "branding.preview.captionColor": "Applied primary color",
};

export const brandingAr: BrandingStrings = {
  "branding.note":
    "تُطبَّق قيم الشركة الافتراضية على جميع المواقع، ويمكن استبدالها لهذا الموقع فقط عبر تخصيص خاص به. قيم الشركة الافتراضية للقراءة فقط هنا.",
  "branding.metadata.updatedAt": "آخر تحديث للهوية البصرية",
  "branding.columns.setting": "الإعداد",
  "branding.columns.companyDefault": "قيمة الشركة الافتراضية",
  "branding.columns.locationOverride": "تخصيص الموقع",
  "branding.columns.applied": "القيمة المطبَّقة",
  "branding.columns.actions": "إجراءات",
  "branding.override.absent": "يتبع قيمة الشركة الافتراضية",
  "branding.default.readOnly": "للقراءة فقط",
  "branding.actions.setOverride": "تعيين تخصيص…",
  "branding.actions.editOverride": "تعديل التخصيص…",
  "branding.actions.clearOverride": "استخدام قيمة الشركة…",
  "branding.actions.cancel": "إلغاء",
  "branding.state.loading": "جارٍ تحميل الهوية البصرية للموقع…",
  "branding.state.loadFailed":
    "تعذر تحميل الهوية البصرية للموقع. تحقق من اتصالك وحاول مرة أخرى.",
  "branding.editor.titleSet": "تعيين تخصيص للموقع",
  "branding.editor.titleEdit": "تعديل تخصيص الموقع",
  "branding.editor.subtitle":
    "تنطبق القيمة على هذا الموقع فقط وتحل محل قيمة الشركة الافتراضية.",
  "branding.editor.companyDefault": "قيمة الشركة الافتراضية",
  "branding.editor.currentOverride": "قيمة التخصيص الحالية",
  "branding.editor.newValue": "القيمة الجديدة لهذا الموقع",
  "branding.editor.save": "حفظ التخصيص",
  "branding.editor.saving": "جارٍ الحفظ…",
  "branding.editor.pickerLabel": "اختيار لون",
  "branding.hint.name":
    "من 1 إلى 120 حرفًا. تُحذف المسافات الزائدة في البداية والنهاية تلقائيًا.",
  "branding.hint.color":
    "ستة أرقام سداسية عشرية بأحرف كبيرة مثل #176BFF. تُحوَّل الأحرف الصغيرة تلقائيًا إلى أحرف كبيرة قبل الحفظ.",
  "branding.validation.nameInvalid":
    "أدخل اسمًا من 1 إلى 120 حرفًا؛ ولا يُسمح بالاسم الفارغ أو بالمحارف الخفية.",
  "branding.validation.colorInvalid":
    "أدخل لونًا سداسيًا عشريًا صالحًا مثل #176BFF: علامة # متبوعة بستة محارف بالضبط من 0-9 و A-F.",
  "branding.clear.title": "استخدام قيمة الشركة الافتراضية لهذا الإعداد؟",
  "branding.clear.body":
    "سيُحذف تخصيص هذا الموقع ويعود الإعداد إلى اتباع قيمة الشركة الافتراضية. لا يمكن تغيير قيمة الشركة نفسها من هنا.",
  "branding.clear.confirm": "حذف التخصيص",
  "branding.conflict.title": "تم تغيير الهوية البصرية من مكان آخر",
  "branding.conflict.body":
    "لم يُحفظ تغييرك لأن إعدادات الهوية البصرية حُدِّثت في الوقت نفسه من قبل مستخدم آخر، ولم يتم الكتابة فوق أي شيء. أعد التحميل لمراجعة أحدث القيم المحفوظة ثم أعد تطبيق تغييرك بشكل مقصود.",
  "branding.conflict.reload": "تحميل الأحدث",
  "branding.errors.valueInvalid":
    "لم تُقبَل القيمة المُدخلة. تحقق من التنسيق والمتطلبات ثم حاول مرة أخرى.",
  "branding.setting.brandDisplayName": "اسم العرض",
  "branding.setting.brandPrimaryColor": "اللون الأساسي",
  "branding.description.brandDisplayName":
    "الاسم المعروض لهذا الموقع. بدون تخصيص، يُستخدم اسم الشركة.",
  "branding.description.brandPrimaryColor":
    "اللون الأساسي للهوية البصرية بصيغة سداسية عشرية بأحرف كبيرة مثل #176BFF.",
  "branding.preview.title": "معاينة الهوية المطبَّقة",
  "branding.preview.captionName": "اسم العرض المطبَّق",
  "branding.preview.captionColor": "اللون الأساسي المطبَّق",
};
