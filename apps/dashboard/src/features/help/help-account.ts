import type { ContextHelpCopy } from "./context-help-types";

export const helpaccount = {
  "security.auth": {
    en: { title: "Account protections",
      body: "Authentication controls protect your own account. MFA and sessions are not a way to change Organization membership or grants." },
    ar: { title: "حماية المصادقة",
      body: "تحمي أدوات المصادقة حسابك الشخصي. لا تُستخدم المصادقة متعددة العوامل أو الجلسات لتغيير عضوية الشركة أو منح المواقع." },
  },
  "security.sessions": {
    en: { title: "Account recovery and session protection",
      body: "Use the account recovery and MFA controls currently offered to protect your signed-in access. A completed recovery action is different from closing a dialog; this page does not provide a general list of all active sessions or a session-revocation editor." },
    ar: { title: "استعادة الحساب وحماية الجلسة",
      body: "استخدم أدوات استعادة الحساب والمصادقة متعددة العوامل المتاحة لحماية وصولك. إتمام إجراء استعادة الحساب يختلف عن إغلاق نافذته؛ لا تعرض هذه الصفحة قائمة عامة بكل الجلسات النشطة أو محرراً لإلغاء جلسة محددة." },
  },
  "help.guides": {
    en: { title: "Workspace guides",
      body: "These guides cover using existing navigation and scope selection. They cannot unlock a feature or substitute for operator training on physical custody." },
    ar: { title: "دليل مساحة العمل",
      body: "تتناول الإرشادات استخدام التنقل واختيار النطاق الموجودين. لا تفتح ميزة محجوبة ولا تغني عن تدريب المشغّل على الحيازة الفعلية." },
  },
  "help.security": {
    en: { title: "Security guidance",
      body: "When your account is eligible, follow the Security link for its protected actions. Access is account-specific and does not depend on selecting an operational Location." },
    ar: { title: "إرشادات الأمان",
      body: "عند أهلية حسابك، استخدم رابط الأمان للإجراءات المحمية. الوصول مرتبط بالحساب ولا يعتمد على اختيار موقع تشغيلي." },
  },
  "help.faq": {
    en: { title: "FAQ",
      body: "Frequently asked questions explain known user workflows. Answers do not replace current server status, permissions or an operator's local procedures." },
    ar: { title: "الأسئلة الشائعة",
      body: "توضح الأسئلة الشائعة مسارات الاستخدام المعروفة. لا تحل الإجابات محل حالة الخادم أو الصلاحيات الحالية أو إجراءات المشغّل المحلية." },
  },
  "activation.invitation": {
    en: { title: "Invitation and password form",
      body: "Only a valid invitation can activate the matching staff account. Keep the invitation out of logs, screenshots and support text; submission does not add operational grants." },
    ar: { title: "الدعوة وتعيين كلمة المرور",
      body: "وحدها الدعوة الصالحة تفعّل حساب الموظف المقابل. احفظ الدعوة بعيداً عن السجلات ولقطات الشاشة ونصوص الدعم؛ الإرسال لا يضيف منحاً تشغيلية." },
  },
} as const satisfies Record<string, ContextHelpCopy>;
