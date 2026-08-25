import type { TranslationDictionary } from "./types";

export const arTranslations: TranslationDictionary = {
  // Shell
  "shell.appName": "فاليه",
  "shell.navOperations": "العمليات",
  "shell.navMaps": "الخرائط",
  "shell.navFinancial": "المالية والرؤى",
  "shell.navConfiguration": "الإعدادات",
  "shell.navOverview": "نظرة عامة",
  "shell.navLiveOperations": "العمليات المباشرة",
  "shell.navSessions": "السيارات قيد الخدمة",
  "shell.navRetrievalQueue": "طلبات إحضار السيارات",
  "shell.navTasks": "المهام",
  "shell.navActiveShifts": "المناوبات النشطة",
  "shell.navKeys": "لوحة عهدة المفاتيح",
  "shell.navIncidents": "الحوادث",
  "shell.navMapsZones": "إعداد الخريطة",
  "shell.navFinancialOverview": "النظرة المالية",
  "shell.navAnalytics": "التحليلات",
  "shell.navReports": "التقارير",
  "shell.navLocationSettings": "إعدادات الموقع",
  "shell.navBranding": "الهوية البصرية",
  "shell.navSubscription": "الاشتراك",
  "shell.openNavigation": "فتح قائمة التنقل",
  "shell.closeNavigation": "إغلاق قائمة التنقل",
  "shell.expandSidebar": "توسيع القائمة الجانبية",
  "shell.collapseSidebar": "طي القائمة الجانبية",
  "shell.managementNavigation": "تنقل لوحة الإدارة",
  "shell.switchToArabic": "التبديل إلى العربية",
  "shell.switchToEnglish": "التبديل إلى الإنجليزية",
  "shell.switchToLightTheme": "تفعيل الوضع الفاتح",
  "shell.switchToDarkTheme": "تفعيل الوضع الداكن",
  "shell.signOut": "تسجيل الخروج",
  "shell.noLocationConfigured": "لم يتم إعداد موقع",

  // Session restore / loading
  "session.restoring": "جارٍ استعادة جلستك…",

  // Sign in
  "signIn.title": "لوحة الإدارة",
  "signIn.subtitle": "سجّل الدخول بحساب الموظف الخاص بك.",
  "signIn.email": "البريد الإلكتروني",
  "signIn.password": "كلمة المرور",
  "signIn.action": "تسجيل الدخول",
  "signIn.inProgress": "جارٍ تسجيل الدخول…",
  "signIn.emailRequired": "البريد الإلكتروني مطلوب.",
  "signIn.passwordRequired": "كلمة المرور مطلوبة.",
  "signIn.invalidCredentials": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  "signIn.rateLimited": "محاولات كثيرة جدًا. حاول مرة أخرى لاحقًا.",
  "signIn.originNotAllowed": "لا يُسمح بتسجيل الدخول من هذا المصدر.",
  "signIn.networkError":
    "اتصال الشبكة غير متاح. تحقق من اتصالك وحاول مرة أخرى.",
  "signIn.genericError": "تعذر تسجيل الدخول. حاول مرة أخرى.",
  "signIn.showPassword": "إظهار كلمة المرور",
  "signIn.hidePassword": "إخفاء كلمة المرور",

  // Session expired
  "expired.title": "انتهت صلاحية جلستك",
  "expired.subtitle": "سجّل الدخول مرة أخرى للمتابعة.",
  "expired.action": "تسجيل الدخول مرة أخرى",

  // No access
  "noAccess.title": "الوصول غير متاح",
  "noAccess.subtitle":
    "ليس لديك صلاحية الوصول إلى هذه المنطقة. تواصل مع مسؤول النظام.",
  "noAccess.action": "تسجيل الخروج",

  // Foundation placeholders
  "placeholder.foundationNote":
    "هذه الصفحة جزء من أساس لوحة الإدارة. سيتم ربط بيانات الخادم في مهمة تكامل لاحقة.",
  "placeholder.emptyState": "لم يتم ربط أي بيانات لهذه الصفحة بعد.",
  "placeholder.locationMissingNote":
    "لم يتم إعداد موقع للتطوير. عيّن NEXT_PUBLIC_DEV_LOCATION_ID للتطوير المحلي؛ ومصدر مواقع حقيقي ينتظر نقطة نهاية للتصريح من الخادم.",

  // Overview
  "page.overview.title": "نظرة عامة",
  "page.overview.description": "ملخص تشغيلي مباشر للموقع المحدد.",
  "overview.infoNote":
    "ملخص إداري مباشر للموقع المحدد. تُعرض المقاييس المتاحة حاليًا لهذا الموقع فقط.",
  "overview.loading": "جارٍ تحميل النظرة العامة…",
  "overview.action.retry": "إعادة المحاولة",
  "overview.error.loadFailed": "تعذر تحميل النظرة العامة الآن. حاول مرة أخرى.",
  "overview.error.network":
    "اتصال الشبكة غير متاح. تحقق من اتصالك وحاول مرة أخرى.",
  "overview.error.accessDenied":
    "ليس لديك صلاحية الوصول إلى نظرة عامة لهذا الموقع.",
  "overview.kpi.vehiclesInService": "المركبات في الخدمة",
  "overview.kpi.vehiclesInServiceSub": "جميع حالات الجلسات عدا المكتملة",
  "overview.kpi.activeRetrievals": "طلبات الاسترجاع النشطة",
  "overview.kpi.queueSub": "لقطة حالية لقائمة الاسترجاع",
  "overview.kpi.oldestWait": "أطول انتظار لطلب",
  "overview.kpi.locationCurrency": "عملة الموقع",
  "overview.states.title": "حالات خدمة المركبات",
  "overview.states.viewSessions": "عرض الجلسات",
  "overview.financial.snapshotTitle": "لمحة مالية",
  "overview.financial.payments": "المدفوعات",
  "overview.financial.amountDue": "المبلغ المستحق",
  "overview.financial.amountPaid": "المبلغ المدفوع",
  "overview.financial.tips": "الإكراميات",
  "overview.financial.details": "التفاصيل",
  "overview.financial.empty":
    "لا يوجد نشاط مدفوعات مسجل لهذا الموقع بعد.",
  "overview.empty.noActivity": "لا يوجد نشاط حالي للمركبات في هذا الموقع الآن.",
  "overview.sections.title": "الأقسام التشغيلية",
  "overview.sections.sessionsDescription": "المركبات الحالية وحالة الخدمة.",
  "overview.sections.retrievalQueueDescription":
    "طلبات الاسترجاع المفتوحة والمقبولة.",
  "overview.sections.tasksDescription": "بيانات مهام الركن والاسترجاع.",
  "overview.sections.activeShiftsDescription":
    "المناوبات النشطة حاليًا في هذا الموقع.",
  "overview.sections.keysDescription":
    "حالة خلايا المفاتيح وجلسة الخدمة المرتبطة.",
  "overview.sections.incidentsDescription": "نظرة عامة على الحوادث الحالية.",
  "overview.duration.minutesUnit": "د",
  "overview.duration.secondsUnit": "ث",
  "overview.value.unavailable": "—",

  // Live operations
  "page.liveOperations.title": "العمليات المباشرة",
  "page.liveOperations.description":
    "مواقع السيارات المباشرة أثناء مهام الركن أو الإحضار فقط.",
  "map.smokeTitle": "معاينة الخريطة",
  "map.loading": "جارٍ تحميل الخريطة…",
  "map.failed": "تعذر تحميل الخريطة.",

  // Sessions
  "page.sessions.title": "السيارات قيد الخدمة",
  "page.sessions.description":
    "كل عملية خدمة حالية ومرجع السيارة وحالتها وموقفها وخانة المفتاح والموظف المُسند عند توفره.",

  // Retrieval queue
  "page.retrievalQueue.title": "طلبات إحضار السيارات",
  "page.retrievalQueue.description": "لقطة حالية لطلبات الإحضار.",

  // Tasks
  "page.tasks.title": "المهام",
  "page.tasks.description": "مهام الركن والإحضار الحالية.",

  // Active shifts
  "page.activeShifts.title": "المناوبات النشطة",
  "page.activeShifts.description": "المناوبات النشطة حاليًا في هذا الموقع.",

  // Keys
  "page.keys.title": "لوحة عهدة المفاتيح",
  "page.keys.description": "حالة خانات المفاتيح وعمليات الخدمة المرتبطة بها.",

  // Incidents
  "page.incidents.title": "الحوادث",
  "page.incidents.description": "نظرة على الحوادث للقراءة فقط.",

  // Maps & zones
  "page.mapsZones.title": "إعداد الخريطة",
  "page.mapsZones.description": "نقاط ومناطق الخريطة لهذا الموقع.",

  // Financial
  "page.financial.title": "النظرة المالية",
  "page.financial.description":
    "مجاميع المدفوعات حسب العملة؛ ولا يتم جمع العملات معًا أبدًا.",

  // Analytics
  "page.analytics.title": "التحليلات",
  "page.analytics.description":
    "مؤشرات التشغيل والمالية والحوادث والطابور المعتمدة.",

  // Reports
  "page.reports.title": "التقارير",
  "page.reports.description": "تقارير يومية وأسبوعية وشهرية مع تصدير CSV/PDF.",

  // Location settings
  "page.locationSettings.title": "إعدادات الموقع",
  "page.locationSettings.description":
    "قيم الشركة الافتراضية مع تخصيصات خاصة بالموقع.",

  // Branding
  "page.branding.title": "الهوية البصرية",
  "page.branding.description": "اسم العرض واللون الأساسي.",

  // Subscription
  "page.subscription.title": "الاشتراك",
  "page.subscription.description": "الخطة والحالة والصلاحيات للقراءة فقط.",

  // Enum labels: session states
  "enum.session.CHECKING_IN": "قيد استلام السيارة",
  "enum.session.AWAITING_PARKING": "بانتظار الركن",
  "enum.session.PARKING": "قيد الركن",
  "enum.session.PARKED": "مركونة",
  "enum.session.REQUESTED": "تم طلب السيارة",
  "enum.session.RETRIEVING": "جارٍ إحضار السيارة",
  "enum.session.READY": "جاهزة للاستلام",
  "enum.session.HANDOFF_PENDING": "بانتظار التسليم",
  "enum.session.COMPLETED": "مكتمل",

  // Enum labels: task statuses and types
  "enum.task.QUEUED": "في الانتظار",
  "enum.task.ASSIGNED": "مُسند",
  "enum.task.ACCEPTED": "مقبول",
  "enum.task.IN_PROGRESS": "قيد التنفيذ",
  "enum.task.COMPLETED": "مكتمل",
  "enum.task.CANCELLED": "ملغي",
  "enum.taskType.PARKING": "مهمة ركن",
  "enum.taskType.RETRIEVAL": "مهمة إحضار سيارة",

  // Enum labels: retrieval requests
  "enum.retrieval.OPEN": "مفتوح",
  "enum.retrieval.ACCEPTED": "مقبول",
  "enum.requester.CUSTOMER": "العميل",
  "enum.requester.STAFF": "الموظف",

  // Enum labels: incidents
  "enum.incident.OPEN": "مفتوح",
  "enum.incident.INVESTIGATING": "قيد المراجعة",
  "enum.incident.RESOLVED": "تمت المعالجة",
  "enum.incident.CLOSED": "مغلق",
  "enum.severity.LOW": "منخفض",
  "enum.severity.MEDIUM": "متوسط",
  "enum.severity.HIGH": "مرتفع",
  "enum.severity.CRITICAL": "حرج",

  // Enum labels: payment status and collection methods
  "enum.payment.NOT_REQUIRED": "غير مطلوب",
  "enum.payment.UNPAID": "غير مدفوع",
  "enum.payment.PENDING": "قيد الانتظار",
  "enum.payment.PAID": "مدفوع",
  "enum.payment.FAILED": "فشل",
  "enum.collection.NONE": "بدون تحصيل",
  "enum.collection.CASH": "نقدي",
  "enum.collection.DIGITAL": "إلكتروني",

  // Enum labels: key slots and tracking freshness
  "enum.keySlot.ACTIVE": "نشط",
  "enum.keySlot.INACTIVE": "غير نشط",
  "enum.freshness.LIVE": "مباشر",
  "enum.freshness.STALE": "غير حديث",
};
