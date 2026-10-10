import type { ContextHelpCopy } from "./context-help-types";

export const helpsettings = {
  "setting.checkInPhotosRequired": {
    en: { title: "Check-in photos required",
      body: "Require or do not require condition photos during check-in. When off, the condition check still exists and optional photos may be captured; changing the flag does not erase previously stored evidence." },
    ar: { title: "صور الدخول مطلوبة",
      body: "حدّد ما إذا كانت صور حالة المركبة إلزامية عند الدخول. عند التعطيل يبقى فحص الحالة قائماً ويمكن التقاط صور اختيارية؛ ولا يحذف التغيير أدلة محفوظة سابقاً." },
  },
  "setting.handoffStandardMethodPolicy": {
    en: { title: "Handoff method",
      body: "Choose the standard pickup verification method: four-digit pickup code, one-time Dynamic QR or either method. A permitted code or QR still requires valid current session and release guards; this is not a supervisor override." },
    ar: { title: "طريقة التسليم",
      body: "اختر طريقة التحقق القياسية عند الاستلام: رمز استلام من أربعة أرقام، أو QR ديناميكي للاستخدام الواحد، أو إحدى الطريقتين. تظل صلاحية الجلسة وشروط التسليم مطلوبة، ولا يُعد هذا الإعداد تجاوزاً من المشرف." },
  },
  "setting.trackingEnabled": {
    en: { title: "Tracking enabled",
      body: "Enable configured GPS tracking during eligible active Parking/Retrieval tasks. It does not authorize continuous employee tracking throughout a Shift or guarantee signal accuracy." },
    ar: { title: "تفعيل التتبع",
      body: "فعّل تتبع GPS المهيأ أثناء مهام الركن أو الاسترجاع النشطة المؤهلة. لا يسمح بمراقبة الموظف طوال الوردية ولا يضمن دقة الإشارة." },
  },
  "setting.rawGpsRetentionDays": {
    en: { title: "Raw GPS retention days",
      body: "Set how many days raw task-scoped GPS records may be retained under the applicable data policy. This is not a promise of historical points where tracking was unavailable or forbidden." },
    ar: { title: "أيام الاحتفاظ ببيانات GPS",
      body: "حدد عدد أيام الاحتفاظ ببيانات GPS الخام المرتبطة بالمهام وفق سياسة البيانات المعمول بها. لا يعني ذلك وجود نقاط تاريخية عندما كان التتبع غير متاح أو غير مسموح." },
  },
  "setting.valetServiceFee": {
    en: { title: "Valet service fee",
      body: "Set the configured valet service fee value for the selected scope. Actual collection also depends on payer, payment method and validation rules; editing this field alone does not charge a guest." },
    ar: { title: "رسوم خدمة صف السيارات",
      body: "حدّد قيمة رسوم خدمة صف السيارات للنطاق المختار. التحصيل الفعلي يعتمد أيضاً على دافع الرسوم وطريقة الدفع وقواعد المصادقة؛ تعديل الحقل وحده لا يفرض دفعة على الضيف." },
  },
  "setting.paymentServicePayer": {
    en: { title: "Service fee payer",
      body: "Choose whether the guest/customer or venue is configured as service-fee payer. This changes policy classification, not the existence of a payment-provider integration or previously settled charges." },
    ar: { title: "دافع رسوم الخدمة",
      body: "اختر ما إذا كان الضيف أو المنشأة هو دافع رسوم الخدمة وفق الإعداد. يغيّر الاختيار تصنيف السياسة ولا ينشئ تكامل دفع أو يبدّل رسوم عمليات مسوّاة سابقاً." },
  },
  "setting.paymentMethodsPolicy": {
    en: { title: "Payment methods",
      body: "Allow cash only, digital only or both according to site policy. Digital availability still depends on the configured provider and actual transaction state; no card details are stored here." },
    ar: { title: "طرق الدفع",
      body: "اسمح بالنقد فقط أو الدفع الرقمي فقط أو كليهما بحسب سياسة الموقع. يبقى الدفع الرقمي معتمداً على المزود المهيأ وحالة المعاملة الفعلية؛ ولا تُخزّن بيانات البطاقة هنا." },
  },
  "setting.tipsEnabled": {
    en: { title: "Tips enabled",
      body: "Control whether optional tips are offered where the workflow supports them. Tip reporting remains separate from the valet service fee; enabling tips does not dictate staff distribution policy." },
    ar: { title: "تفعيل الإكراميات",
      body: "تحكم في إتاحة الإكراميات الاختيارية حيث يدعمها المسار. يبقى تقرير الإكراميات منفصلاً عن رسوم الخدمة؛ ولا يحدد تفعيلها سياسة توزيعها على الموظفين." },
  },
  "setting.validationEnabled": {
    en: { title: "Validation enabled",
      body: "Enable supported venue validation behavior for authorized service charges. Validation is a fee/payer rule and does not itself prove payment completion or override vehicle release checks." },
    ar: { title: "تفعيل المصادقة",
      body: "فعّل سلوك المصادقة على الرسوم الذي تدعمه المنشأة. المصادقة قاعدة للرسوم أو الجهة الدافعة، ولا تثبت اكتمال الدفع وحدها ولا تتجاوز شروط تسليم المركبة." },
  },
  "setting.releaseRequiresPayment": {
    en: { title: "Release requires payment",
      body: "Require payment completion before release under the site's existing authorized handoff policy. This does not disable pickup-code/QR identity verification or permit manual unaudited release." },
    ar: { title: "الدفع مطلوب قبل التسليم",
      body: "اشترط اكتمال الدفع قبل التسليم ضمن سياسة الاستلام المخوّلة للموقع. لا يعطّل ذلك التحقق بالرمز أو QR ولا يسمح بتسليم يدوي غير مسجّل." },
  },
  "setting.languageDefault": {
    en: { title: "Default language",
      body: "Choose the default customer/operational display language where this setting is used: English or Arabic. A user's explicit language choice and real RTL/LTR rendering remain separate concerns." },
    ar: { title: "اللغة الافتراضية",
      body: "اختر لغة العرض الافتراضية المدعومة حيث يستخدمها هذا الإعداد: الإنجليزية أو العربية. يبقى اختيار المستخدم الصريح ودعم اتجاه الواجهة الصحيح أمرين منفصلين." },
  },
  "setting.ocrAssistEnabled": {
    en: { title: "OCR assist enabled",
      body: "Control whether OCR assists plate entry in applicable flows. Recognition is advisory: the employee must be able to confirm/edit and always use manual entry if the camera or provider fails." },
    ar: { title: "تفعيل مساعدة OCR",
      body: "تحكم في مساعدة OCR لإدخال اللوحة في المسارات الداعمة. القراءة مساعدة فقط؛ يستطيع الموظف تأكيد الرقم أو تعديله واستخدام الإدخال اليدوي دائماً عند تعطل الكاميرا أو المزود." },
  },
  "setting.parkingSpotRequired": {
    en: { title: "Parking spot required",
      body: "Choose whether a specific parking spot must be recorded where the workflow supports this policy. It does not imply every Location has a configured spot or that a missing GPS point is a parking record." },
    ar: { title: "موقف السيارة مطلوب",
      body: "اختر ما إذا كان تسجيل موقف محدد مطلوباً في المسار الذي يدعم السياسة. لا يعني ذلك أن كل موقع لديه مواقف مهيأة أو أن نقطة GPS المفقودة سجل ركن." },
  },
  "setting.employeeRetrievalRequestedNotificationEnabled": {
    en: { title: "Employee retrieval notification",
      body: "Control eligibility for staff retrieval-request notifications. Actual delivery additionally requires authorized Shift/Location, valid device registration, permission, network and OS behavior; this setting cannot guarantee timing." },
    ar: { title: "إشعار الموظف بطلب الاسترجاع",
      body: "تحكم في أهلية إشعارات طلب استرجاع المركبة للموظفين. يعتمد الوصول الفعلي أيضاً على الوردية والموقع والتسجيل والأذونات والشبكة ونظام الجهاز؛ ولا يضمن الإعداد توقيت الإشعار." },
  },
  "setting.guestVehicleReadyNotificationEnabled": {
    en: { title: "Guest vehicle-ready notification",
      body: "Control guest notifications when the vehicle reaches the relevant ready state. Delivery depends on available/consented channel and provider; it never discloses exact parking spot or key slot." },
    ar: { title: "إشعار الضيف بجاهزية المركبة",
      body: "تحكم في إشعار الضيف عند بلوغ المركبة حالة الجاهزية المعنية. يعتمد وصول الرسالة على القناة المتاحة والموافق عليها والمزود؛ ولا تكشف مكان الركن الدقيق أو خانة المفتاح." },
  },
} as const satisfies Record<string, ContextHelpCopy>;
