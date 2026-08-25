/**
 * Location Settings surface strings (D4-003): typed configuration settings,
 * Company default -> Location override presentation, optimistic-concurrency
 * conflict posture and setting/enum labels. Feature-local fragment.
 */

export interface LocationSettingsStrings {
  /** Explains precedence, read-only defaults and reference-only metadata. */
  "config.note": string;
  /** Digital-policy truth note attached to the payment methods setting. */
  "config.note.digitalOnly": string;
  "config.metadata.timezone": string;
  "config.metadata.currency": string;
  "config.metadata.updatedAt": string;
  "config.columns.setting": string;
  "config.columns.companyDefault": string;
  "config.columns.locationOverride": string;
  "config.columns.applied": string;
  "config.columns.actions": string;
  /** Row value shown when no location override exists. */
  "config.override.absent": string;
  /** Marks the company-default column as intentionally read-only. */
  "config.default.readOnly": string;
  "config.actions.setOverride": string;
  "config.actions.editOverride": string;
  "config.actions.clearOverride": string;
  "config.actions.cancel": string;
  "config.state.loading": string;
  "config.state.loadFailed": string;
  "config.editor.titleSet": string;
  "config.editor.titleEdit": string;
  "config.editor.subtitle": string;
  "config.editor.companyDefault": string;
  "config.editor.currentOverride": string;
  "config.editor.newValue": string;
  "config.editor.save": string;
  "config.editor.saving": string;
  "config.validation.booleanInvalid": string;
  "config.validation.optionInvalid": string;
  "config.validation.retentionInvalid": string;
  "config.validation.feeInvalid": string;
  "config.hint.retention": string;
  "config.hint.fee": string;
  "config.clear.title": string;
  "config.clear.body": string;
  "config.clear.confirm": string;
  "config.conflict.title": string;
  "config.conflict.body": string;
  "config.conflict.reload": string;
  "config.errors.valueInvalid": string;
  "config.setting.checkInPhotosRequired": string;
  "config.setting.handoffStandardMethodPolicy": string;
  "config.setting.trackingEnabled": string;
  "config.setting.rawGpsRetentionDays": string;
  "config.setting.valetServiceFee": string;
  "config.setting.paymentServicePayer": string;
  "config.setting.paymentMethodsPolicy": string;
  "config.setting.tipsEnabled": string;
  "config.setting.validationEnabled": string;
  "config.setting.releaseRequiresPayment": string;
  "config.description.checkInPhotosRequired": string;
  "config.description.handoffStandardMethodPolicy": string;
  "config.description.trackingEnabled": string;
  "config.description.rawGpsRetentionDays": string;
  "config.description.valetServiceFee": string;
  "config.description.paymentServicePayer": string;
  "config.description.paymentMethodsPolicy": string;
  "config.description.tipsEnabled": string;
  "config.description.validationEnabled": string;
  "config.description.releaseRequiresPayment": string;
  "enum.config.method.PICKUP_CODE": string;
  "enum.config.method.DYNAMIC_QR": string;
  "enum.config.method.EITHER": string;
  "enum.config.payer.CUSTOMER": string;
  "enum.config.payer.VENUE": string;
  "enum.config.methods.CASH_ONLY": string;
  "enum.config.methods.DIGITAL_ONLY": string;
  "enum.config.methods.CASH_OR_DIGITAL": string;
  "enum.config.boolean.ON": string;
  "enum.config.boolean.OFF": string;
}

export const locationSettingsEn: LocationSettingsStrings = {
  "config.note":
    "Company defaults apply everywhere and can be replaced for this location only by a location override. Defaults are read-only here. Currency and timezone are authoritative location details shown for reference; they are not among the overridable settings.",
  "config.note.digitalOnly":
    "\"Digital only\" is a payment-methods policy: selecting it configures the policy only and does not activate or connect any digital payment provider.",
  "config.metadata.timezone": "Timezone",
  "config.metadata.currency": "Currency",
  "config.metadata.updatedAt": "Settings updated",
  "config.columns.setting": "Setting",
  "config.columns.companyDefault": "Company default",
  "config.columns.locationOverride": "Location override",
  "config.columns.applied": "Applied value",
  "config.columns.actions": "Actions",
  "config.override.absent": "Using company default",
  "config.default.readOnly": "Read-only",
  "config.actions.setOverride": "Set override…",
  "config.actions.editOverride": "Edit override…",
  "config.actions.clearOverride": "Use company default…",
  "config.actions.cancel": "Cancel",
  "config.state.loading": "Loading location configuration…",
  "config.state.loadFailed":
    "The location configuration could not be loaded. Check your connection and try again.",
  "config.editor.titleSet": "Set a location override",
  "config.editor.titleEdit": "Edit the location override",
  "config.editor.subtitle":
    "The value applies to this location only and overrides the company default.",
  "config.editor.companyDefault": "Company default",
  "config.editor.currentOverride": "Current override value",
  "config.editor.newValue": "New value for this location",
  "config.editor.save": "Save override",
  "config.editor.saving": "Saving…",
  "config.validation.booleanInvalid": "Choose a valid on/off value.",
  "config.validation.optionInvalid": "Choose one of the listed options.",
  "config.validation.retentionInvalid":
    "Enter a whole number between 1 and 2,147,483,647.",
  "config.validation.feeInvalid":
    "Enter an amount like 12.5 or 12.500 — up to three decimal places.",
  "config.hint.retention": "Whole number of days, 1 to 2,147,483,647.",
  "config.hint.fee":
    "Up to three decimal places. The server also verifies exact representability in the location currency.",
  "config.clear.title": "Use the company default for this setting?",
  "config.clear.body":
    "The location override will be cleared and this location will follow the company default again. The company default itself cannot be changed here.",
  "config.clear.confirm": "Clear override",
  "config.conflict.title": "This setting changed elsewhere",
  "config.conflict.body":
    "Your change was not saved: the location configuration was updated by someone else at the same time and nothing was overwritten. Reload to review the latest saved values, then apply your change again deliberately.",
  "config.conflict.reload": "Reload latest",
  "config.errors.valueInvalid":
    "The entered value was not accepted. Check the format and requirements, then try again.",
  "config.setting.checkInPhotosRequired": "Check-in condition photos",
  "config.setting.handoffStandardMethodPolicy": "Standard handoff method",
  "config.setting.trackingEnabled": "Task GPS tracking",
  "config.setting.rawGpsRetentionDays": "GPS history retention",
  "config.setting.valetServiceFee": "Valet service fee",
  "config.setting.paymentServicePayer": "Service fee payer",
  "config.setting.paymentMethodsPolicy": "Payment methods policy",
  "config.setting.tipsEnabled": "Tips enabled",
  "config.setting.validationEnabled": "Fee validation enabled",
  "config.setting.releaseRequiresPayment": "Release requires payment",
  "config.description.checkInPhotosRequired":
    "Require vehicle condition photos before check-in can be completed.",
  "config.description.handoffStandardMethodPolicy":
    "Which secure verification method customers use to receive their vehicle.",
  "config.description.trackingEnabled":
    "Allow GPS tracking while parking or retrieval tasks are running.",
  "config.description.rawGpsRetentionDays":
    "How many days raw task GPS history is kept.",
  "config.description.valetServiceFee":
    "Default service fee for new sessions at this location.",
  "config.description.paymentServicePayer":
    "Who pays the valet service fee: the customer or the venue.",
  "config.description.paymentMethodsPolicy":
    "Which collection methods may be used for new payments.",
  "config.description.tipsEnabled":
    "Allow customers to add tips when paying.",
  "config.description.validationEnabled":
    "Allow the venue to cover part or all of the valet fee.",
  "config.description.releaseRequiresPayment":
    "Require the accepted payment condition before releasing a vehicle.",
  "enum.config.method.PICKUP_CODE": "4-digit pickup code",
  "enum.config.method.DYNAMIC_QR": "Dynamic QR",
  "enum.config.method.EITHER": "Pickup code or QR",
  "enum.config.payer.CUSTOMER": "Customer",
  "enum.config.payer.VENUE": "Venue",
  "enum.config.methods.CASH_ONLY": "Cash only",
  "enum.config.methods.DIGITAL_ONLY": "Digital only",
  "enum.config.methods.CASH_OR_DIGITAL": "Cash or digital",
  "enum.config.boolean.ON": "On",
  "enum.config.boolean.OFF": "Off",
};

export const locationSettingsAr: LocationSettingsStrings = {
  "config.note":
    "تُطبَّق قيم الشركة الافتراضية على جميع المواقع، ويمكن تجاوزها لهذا الموقع فقط عبر تخصيص خاص به. قيم الشركة الافتراضية للقراءة فقط هنا. العملة والمنطقة الزمنية بيانات رسمية للموقع تُعرض للاسترشاد فقط وهي ليست ضمن الإعدادات القابلة للتخصيص.",
  "config.note.digitalOnly":
    "«رقميًا فقط» سياسة لطرق الدفع: اختيارها يضبط السياسة فقط ولا يعني تفعيل أي مزود دفع رقمي أو الاتصال به.",
  "config.metadata.timezone": "المنطقة الزمنية",
  "config.metadata.currency": "العملة",
  "config.metadata.updatedAt": "آخر تحديث للإعدادات",
  "config.columns.setting": "الإعداد",
  "config.columns.companyDefault": "قيمة الشركة الافتراضية",
  "config.columns.locationOverride": "تخصيص الموقع",
  "config.columns.applied": "القيمة المطبَّقة",
  "config.columns.actions": "إجراءات",
  "config.override.absent": "يتبع قيمة الشركة الافتراضية",
  "config.default.readOnly": "للقراءة فقط",
  "config.actions.setOverride": "تعيين تخصيص…",
  "config.actions.editOverride": "تعديل التخصيص…",
  "config.actions.clearOverride": "استخدام قيمة الشركة…",
  "config.actions.cancel": "إلغاء",
  "config.state.loading": "جارٍ تحميل إعدادات الموقع…",
  "config.state.loadFailed":
    "تعذر تحميل إعدادات الموقع. تحقق من اتصالك وحاول مرة أخرى.",
  "config.editor.titleSet": "تعيين تخصيص للموقع",
  "config.editor.titleEdit": "تعديل تخصيص الموقع",
  "config.editor.subtitle":
    "تنطبق القيمة على هذا الموقع فقط وتحل محل قيمة الشركة الافتراضية.",
  "config.editor.companyDefault": "قيمة الشركة الافتراضية",
  "config.editor.currentOverride": "قيمة التخصيص الحالية",
  "config.editor.newValue": "القيمة الجديدة لهذا الموقع",
  "config.editor.save": "حفظ التخصيص",
  "config.editor.saving": "جارٍ الحفظ…",
  "config.validation.booleanInvalid": "اختر قيمة صحيحة (مفعّل/معطّل).",
  "config.validation.optionInvalid": "اختر أحد الخيارات المتاحة.",
  "config.validation.retentionInvalid":
    "أدخل عددًا صحيحًا بين 1 و2147483647.",
  "config.validation.feeInvalid":
    "أدخل مبلغًا مثل 12.5 أو 12.500 — بحد أقصى ثلاث خانات عشرية.",
  "config.hint.retention": "عدد أيام كامل بين 1 و2,147,483,647.",
  "config.hint.fee":
    "حتى ثلاث خانات عشرية. يتحقق الخادم أيضًا من قابلية تمثيل المبلغ بدقة بعملة الموقع.",
  "config.clear.title": "استخدام قيمة الشركة الافتراضية لهذا الإعداد؟",
  "config.clear.body":
    "سيُحذف تخصيص هذا الموقع ويعود الإعداد إلى اتباع قيمة الشركة الافتراضية. لا يمكن تغيير قيمة الشركة نفسها من هنا.",
  "config.clear.confirm": "حذف التخصيص",
  "config.conflict.title": "تم تغيير هذا الإعداد من مكان آخر",
  "config.conflict.body":
    "لم يُحفظ تغييرك لأن إعدادات الموقع حُدِّثت في الوقت نفسه من قبل مستخدم آخر، ولم يتم الكتابة فوق أي شيء. أعد التحميل لمراجعة أحدث القيم المحفوظة ثم أعد تطبيق تغييرك بشكل مقصود.",
  "config.conflict.reload": "تحميل الأحدث",
  "config.errors.valueInvalid":
    "لم تُقبَل القيمة المُدخلة. تحقق من التنسيق والمتطلبات ثم حاول مرة أخرى.",
  "config.setting.checkInPhotosRequired": "صور حالة السيارة عند الاستلام",
  "config.setting.handoffStandardMethodPolicy": "طريقة التسليم المعيارية",
  "config.setting.trackingEnabled": "تتبع المهام عبر GPS",
  "config.setting.rawGpsRetentionDays": "مدة الاحتفاظ بسجل GPS",
  "config.setting.valetServiceFee": "رسوم خدمة فاليه",
  "config.setting.paymentServicePayer": "دافع رسوم الخدمة",
  "config.setting.paymentMethodsPolicy": "سياسة طرق الدفع",
  "config.setting.tipsEnabled": "تمكين الإكراميات",
  "config.setting.validationEnabled": "تمكين تغطية الرسوم",
  "config.setting.releaseRequiresPayment": "اشتراط الدفع قبل التسليم",
  "config.description.checkInPhotosRequired":
    "طلب صور لحالة السيارة قبل إكمال استلام السيارة.",
  "config.description.handoffStandardMethodPolicy":
    "طريقة التحقق الآمن التي يستخدمها العملاء لاستلام سياراتهم.",
  "config.description.trackingEnabled":
    "السماح بتتبع الموقع أثناء مهام الركن والإحضار.",
  "config.description.rawGpsRetentionDays":
    "عدد الأيام التي يُحتفظ فيها بسجل مواقع المهام الخام.",
  "config.description.valetServiceFee":
    "رسوم الخدمة الافتراضية للعمليات الجديدة في هذا الموقع.",
  "config.description.paymentServicePayer":
    "من يدفع رسوم الخدمة: العميل أم المنشأة.",
  "config.description.paymentMethodsPolicy":
    "طرق التحصيل المسموح بها للمدفوعات الجديدة.",
  "config.description.tipsEnabled": "السماح للعملاء بإضافة إكرامية عند الدفع.",
  "config.description.validationEnabled":
    "السماح للمنشأة بتغطية جزء من رسوم فاليه أو كاملها.",
  "config.description.releaseRequiresPayment":
    "اشتراط تحقق شرط الدفع المعتمد قبل تسليم السيارة.",
  "enum.config.method.PICKUP_CODE": "رمز استلام من 4 أرقام",
  "enum.config.method.DYNAMIC_QR": "رمز QR ديناميكي",
  "enum.config.method.EITHER": "رمز الاستلام أو رمز QR",
  "enum.config.payer.CUSTOMER": "العميل",
  "enum.config.payer.VENUE": "المنشأة",
  "enum.config.methods.CASH_ONLY": "نقدًا فقط",
  "enum.config.methods.DIGITAL_ONLY": "رقميًا فقط",
  "enum.config.methods.CASH_OR_DIGITAL": "نقدًا أو رقميًا",
  "enum.config.boolean.ON": "مفعّل",
  "enum.config.boolean.OFF": "معطّل",
};
