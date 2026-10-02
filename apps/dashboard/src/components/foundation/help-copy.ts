import type { DashboardLocale } from "../../lib/i18n/locale";

export function helpCopy(locale: DashboardLocale) {
  return locale === "ar"
    ? {
        subtitle: "إرشادات عملية لاختيار النطاق والإعدادات وأمان الحساب.",
        notice: "إرشادات لوحة الإدارة",
        noticeBody:
          "تعتمد الصفحات والإجراءات المتاحة على صلاحياتك ونطاق العمل المحدد.",
        guideTitle: "استخدام مساحة العمل",
        faqTitle: "أسئلة شائعة",
        securityTitle: "حماية حسابك",
        securityBody:
          "استخدم صفحة أمان الحساب لإعداد تطبيق المصادقة والتحقق وإدارة رموز الاسترداد. احتفظ برموز الاسترداد في مكان آمن ولا تشاركها.",
        securityLink: "فتح أمان الحساب",
        guides: [
          [
            "اختيار الشركة والموقع",
            "استخدم محدد النطاق لاختيار الشركة والموقع المصرح لك بهما. عرض جميع المواقع متاح لمدير الشركة حيث تدعمه الصفحة.",
          ],
          [
            "الإعدادات الموروثة",
            "يرث الموقع القيمة الافتراضية للشركة حتى يُحفظ تجاوز للموقع. مسح التجاوز يعيد الوراثة؛ اختيار «لا» يحفظ قيمة مستقلة.",
          ],
          [
            "إدارة الموظفين",
            "يدير مدير الشركة أدوار الموظفين والوصول إلى المواقع من صفحة الموظفين. تعرض صفحة الأدوار الأدوار الثابتة ودليل المستخدمين.",
          ],
        ],
        faqs: [
          [
            "لماذا بعض الصفحات للقراءة فقط؟",
            "تعرض حالة الخدمات ضمن السياسات والإعدادات حالة الخدمات، ويعرض الاشتراك الخطة والميزات المسجلة. لا توفر هذه الصفحات إعداد مزودي الخدمات أو تنفيذ الفوترة.",
          ],
          [
            "ماذا أفعل إذا تغيّرت الإعدادات أثناء الحفظ؟",
            "راجع القيم التي أعيد تحميلها قبل المحاولة مجددًا. بعد طلب التحقق الأمني، راجع التغيير وأعد إرساله بنفسك.",
          ],
          [
            "هل ساعات العمل تمنع استقبال السيارات؟",
            "ساعات العمل معلومات إرشادية. لا توقف إجراءات الدخول أو الاسترجاع أو التسليم.",
          ],
          [
            "كيف أغيّر اللغة والمظهر؟",
            "استخدم عناصر اللغة والمظهر في لوحة الإدارة. إعداد اللغة الافتراضية للموقع منفصل عن اختيار لغة واجهتك.",
          ],
        ],
      }
    : {
        subtitle:
          "Practical guidance for workspace scope, configuration, and account security.",
        notice: "Dashboard guidance",
        noticeBody:
          "Available pages and actions depend on your authority and selected workspace scope.",
        guideTitle: "Using your workspace",
        faqTitle: "Frequently asked questions",
        securityTitle: "Protect your account",
        securityBody:
          "Use Account security to set up your authenticator, verify access, and manage recovery codes. Keep recovery codes somewhere safe and never share them.",
        securityLink: "Open account security",
        guides: [
          [
            "Choose a Company and Location",
            "Use the scope selector to choose an authorized Company and Location. Company Admins can use All Locations where the page supports it.",
          ],
          [
            "Understand inherited settings",
            "A Location inherits the Company default until a Location override is saved. Clearing the override restores inheritance; choosing No saves a distinct value.",
          ],
          [
            "Manage staff access",
            "Company Admins manage staff roles and Location access from Employees. Roles & Permissions shows the fixed roles and the user directory.",
          ],
        ],
        faqs: [
          [
            "Why are some pages read-only?",
            "Service Status under Policies & Settings shows service status, and Subscription shows the recorded plan and features. These pages do not configure providers or execute billing.",
          ],
          [
            "What if settings change while I save?",
            "Review the reloaded values before trying again. After security verification is requested, review your change and explicitly submit it again.",
          ],
          [
            "Do operating hours block vehicle intake?",
            "Operating hours are informational. They do not stop check-in, retrieval, or handoff actions.",
          ],
          [
            "How do I change language and appearance?",
            "Use the Dashboard language and theme controls. A Location's default-language setting is separate from your interface language selection.",
          ],
        ],
      };
}
