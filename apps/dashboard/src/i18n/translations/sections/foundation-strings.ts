/**
 * Foundation surfaces: app shell, auth flows, session states and read-only placeholder pages.
 */

export interface FoundationStrings {
  "shell.appName": string;
  "shell.navOperations": string;
  "shell.navMaps": string;
  "shell.navFinancial": string;
  "shell.navConfiguration": string;
  "shell.navOverview": string;
  "shell.navLiveOperations": string;
  "shell.navSessions": string;
  "shell.navRetrievalQueue": string;
  "shell.navTasks": string;
  "shell.navActiveShifts": string;
  "shell.navKeys": string;
  "shell.navIncidents": string;
  "shell.navMapsZones": string;
  "shell.navFinancialOverview": string;
  "shell.navAnalytics": string;
  "shell.navReports": string;
  "shell.navLocationSettings": string;
  "shell.navBranding": string;
  "shell.navSubscription": string;
  "shell.openNavigation": string;
  "shell.closeNavigation": string;
  "shell.expandSidebar": string;
  "shell.collapseSidebar": string;
  "shell.managementNavigation": string;
  "shell.switchToArabic": string;
  "shell.switchToEnglish": string;
  "shell.switchToLightTheme": string;
  "shell.switchToDarkTheme": string;
  "shell.signOut": string;
  "signOut.inProgress": string;
  "signOut.failedTitle": string;
  "signOut.failedMessage": string;
  "signOut.retry": string;
  "shell.noLocationConfigured": string;
  "session.restoring": string;
  "signIn.title": string;
  "signIn.subtitle": string;
  "signIn.email": string;
  "signIn.password": string;
  "signIn.action": string;
  "signIn.inProgress": string;
  "signIn.emailRequired": string;
  "signIn.passwordRequired": string;
  "signIn.invalidCredentials": string;
  "signIn.rateLimited": string;
  "signIn.originNotAllowed": string;
  "signIn.networkError": string;
  "signIn.genericError": string;
  "signIn.showPassword": string;
  "signIn.hidePassword": string;
  "expired.title": string;
  "expired.subtitle": string;
  "expired.action": string;
  "noAccess.title": string;
  "noAccess.subtitle": string;
  "noAccess.action": string;
  "placeholder.locationMissingNote": string;
  "page.liveOperations.title": string;
  "page.liveOperations.description": string;
  "map.smokeTitle": string;
  "map.loading": string;
  "map.failed": string;
  "page.mapsZones.title": string;
  "page.mapsZones.description": string;
  "page.financial.title": string;
  "page.financial.description": string;
  "page.analytics.title": string;
  "page.analytics.description": string;
  "page.reports.title": string;
  "page.reports.description": string;
  "page.locationSettings.title": string;
  "page.locationSettings.description": string;
  "page.branding.title": string;
  "page.branding.description": string;
  "page.subscription.title": string;
  "page.subscription.description": string;
}

export const foundationEn: FoundationStrings = {
  "shell.appName": "VAYLET",
  "shell.navOperations": "Operations",
  "shell.navMaps": "Maps",
  "shell.navFinancial": "Financial & Insights",
  "shell.navConfiguration": "Configuration",
  "shell.navOverview": "Overview",
  "shell.navLiveOperations": "Live Operations",
  "shell.navSessions": "Vehicles in Service",
  "shell.navRetrievalQueue": "Vehicle Retrieval Queue",
  "shell.navTasks": "Tasks",
  "shell.navActiveShifts": "Active Shifts",
  "shell.navKeys": "Key Custody Board",
  "shell.navIncidents": "Incidents",
  "shell.navMapsZones": "Map Setup",
  "shell.navFinancialOverview": "Financial Overview",
  "shell.navAnalytics": "Analytics",
  "shell.navReports": "Reports",
  "shell.navLocationSettings": "Location Settings",
  "shell.navBranding": "Branding",
  "shell.navSubscription": "Subscription",
  "shell.openNavigation": "Open navigation",
  "shell.closeNavigation": "Close navigation",
  "shell.expandSidebar": "Expand sidebar",
  "shell.collapseSidebar": "Collapse sidebar",
  "shell.managementNavigation": "Management navigation",
  "shell.switchToArabic": "Switch to Arabic",
  "shell.switchToEnglish": "Switch to English",
  "shell.switchToLightTheme": "Switch to light theme",
  "shell.switchToDarkTheme": "Switch to dark theme",
  "shell.signOut": "Sign out",
  "signOut.inProgress": "Signing out…",
  "signOut.failedTitle": "Sign-out could not be confirmed",
  "signOut.failedMessage":
    "Your server session may still be active. Retry sign-out before leaving this device.",
  "signOut.retry": "Retry sign-out",
  "shell.noLocationConfigured": "No location configured",
  "session.restoring": "Restoring your session…",
  "signIn.title": "Management Dashboard",
  "signIn.subtitle": "Sign in with your staff account.",
  "signIn.email": "Email",
  "signIn.password": "Password",
  "signIn.action": "Sign in",
  "signIn.inProgress": "Signing in…",
  "signIn.emailRequired": "Email is required.",
  "signIn.passwordRequired": "Password is required.",
  "signIn.invalidCredentials": "Invalid email or password.",
  "signIn.rateLimited": "Too many attempts. Try again later.",
  "signIn.originNotAllowed": "Sign-in is not allowed from this origin.",
  "signIn.networkError":
    "Network connection unavailable. Check your connection and try again.",
  "signIn.genericError": "Unable to sign in. Please try again.",
  "signIn.showPassword": "Show password",
  "signIn.hidePassword": "Hide password",
  "expired.title": "Your session has expired",
  "expired.subtitle": "Please sign in again to continue.",
  "expired.action": "Sign in again",
  "noAccess.title": "Access not available",
  "noAccess.subtitle":
    "You don't have access to this area. Please contact your administrator.",
  "noAccess.action": "Sign out",
  "placeholder.locationMissingNote":
    "No authorized location is currently selected.",
  "page.liveOperations.title": "Live Operations",
  "page.liveOperations.description":
    "Task-scoped live vehicle positions during Parking or Retrieval tasks.",
  "map.smokeTitle": "Map preview",
  "map.loading": "Loading map…",
  "map.failed": "The map could not be loaded.",
  "page.mapsZones.title": "Map Setup",
  "page.mapsZones.description":
    "Map points and polygon areas for this location.",
  "page.financial.title": "Financial Overview",
  "page.financial.description":
    "Currency-grouped payment aggregates; currencies are never combined.",
  "page.analytics.title": "Analytics",
  "page.analytics.description":
    "Accepted operational, financial, incident and queue metrics.",
  "page.reports.title": "Reports",
  "page.reports.description":
    "Daily, weekly and monthly reports with CSV/PDF export.",
  "page.locationSettings.title": "Location Settings",
  "page.locationSettings.description":
    "Company defaults with location-specific overrides.",
  "page.branding.title": "Branding",
  "page.branding.description": "Display name and primary color.",
  "page.subscription.title": "Subscription",
  "page.subscription.description": "Read-only plan, status and entitlements.",
};

export const foundationAr: FoundationStrings = {
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
  "signOut.inProgress": "جارٍ تسجيل الخروج…",
  "signOut.failedTitle": "تعذر تأكيد تسجيل الخروج",
  "signOut.failedMessage":
    "قد تظل جلستك على الخادم نشطة. أعد محاولة تسجيل الخروج قبل مغادرة هذا الجهاز.",
  "signOut.retry": "إعادة محاولة تسجيل الخروج",
  "shell.noLocationConfigured": "لم يتم إعداد موقع",
  "session.restoring": "جارٍ استعادة جلستك…",
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
  "expired.title": "انتهت صلاحية جلستك",
  "expired.subtitle": "سجّل الدخول مرة أخرى للمتابعة.",
  "expired.action": "تسجيل الدخول مرة أخرى",
  "noAccess.title": "الوصول غير متاح",
  "noAccess.subtitle":
    "ليس لديك صلاحية الوصول إلى هذه المنطقة. تواصل مع مسؤول النظام.",
  "noAccess.action": "تسجيل الخروج",
  "placeholder.locationMissingNote": "لا يوجد موقع مصرّح به محدد حاليًا.",
  "page.liveOperations.title": "العمليات المباشرة",
  "page.liveOperations.description":
    "مواقع السيارات المباشرة أثناء مهام الركن أو الإحضار فقط.",
  "map.smokeTitle": "معاينة الخريطة",
  "map.loading": "جارٍ تحميل الخريطة…",
  "map.failed": "تعذر تحميل الخريطة.",
  "page.mapsZones.title": "إعداد الخريطة",
  "page.mapsZones.description": "نقاط ومناطق الخريطة لهذا الموقع.",
  "page.financial.title": "النظرة المالية",
  "page.financial.description":
    "مجاميع المدفوعات حسب العملة؛ ولا يتم جمع العملات معًا أبدًا.",
  "page.analytics.title": "التحليلات",
  "page.analytics.description":
    "مؤشرات التشغيل والمالية والحوادث والطابور المعتمدة.",
  "page.reports.title": "التقارير",
  "page.reports.description": "تقارير يومية وأسبوعية وشهرية مع تصدير CSV/PDF.",
  "page.locationSettings.title": "إعدادات الموقع",
  "page.locationSettings.description":
    "قيم الشركة الافتراضية مع تخصيصات خاصة بالموقع.",
  "page.branding.title": "الهوية البصرية",
  "page.branding.description": "اسم العرض واللون الأساسي.",
  "page.subscription.title": "الاشتراك",
  "page.subscription.description": "الخطة والحالة والصلاحيات للقراءة فقط.",
};
