/**
 * Management overview surface strings (D2-002).
 */

export interface OverviewStrings {
  "page.overview.title": string;
  "page.overview.description": string;
  "overview.infoNote": string;
  "overview.loading": string;
  "overview.action.retry": string;
  "overview.error.loadFailed": string;
  "overview.error.network": string;
  "overview.error.accessDenied": string;
  "overview.kpi.vehiclesInService": string;
  "overview.kpi.vehiclesInServiceSub": string;
  "overview.kpi.activeRetrievals": string;
  "overview.kpi.queueSub": string;
  "overview.kpi.oldestWait": string;
  "overview.kpi.locationCurrency": string;
  "overview.states.title": string;
  "overview.states.viewSessions": string;
  "overview.financial.snapshotTitle": string;
  "overview.financial.payments": string;
  "overview.financial.amountDue": string;
  "overview.financial.amountPaid": string;
  "overview.financial.tips": string;
  "overview.financial.details": string;
  "overview.financial.empty": string;
  "overview.empty.noActivity": string;
  "overview.sections.title": string;
  "overview.sections.sessionsDescription": string;
  "overview.sections.retrievalQueueDescription": string;
  "overview.sections.tasksDescription": string;
  "overview.sections.activeShiftsDescription": string;
  "overview.sections.keysDescription": string;
  "overview.sections.incidentsDescription": string;
  "overview.duration.minutesUnit": string;
  "overview.duration.secondsUnit": string;
  "overview.value.unavailable": string;
}

export const overviewEn: OverviewStrings = {
  "page.overview.title": "Overview",
  "page.overview.description":
    "Live management summary for the selected location.",
  "overview.infoNote":
    "A live management summary for the selected location. Only metrics currently available for this location are shown.",
  "overview.loading": "Loading overview…",
  "overview.action.retry": "Retry",
  "overview.error.loadFailed":
    "We couldn't load the overview right now. Please try again.",
  "overview.error.network":
    "Network connection unavailable. Check your connection and try again.",
  "overview.error.accessDenied":
    "You don't have access to this location's overview.",
  "overview.kpi.vehiclesInService": "Vehicles in service",
  "overview.kpi.vehiclesInServiceSub": "All session states except Completed",
  "overview.kpi.activeRetrievals": "Active retrieval requests",
  "overview.kpi.queueSub": "Current queue snapshot",
  "overview.kpi.oldestWait": "Oldest request wait",
  "overview.kpi.locationCurrency": "Location currency",
  "overview.states.title": "Vehicle service states",
  "overview.states.viewSessions": "View sessions",
  "overview.financial.snapshotTitle": "Financial snapshot",
  "overview.financial.payments": "Payments",
  "overview.financial.amountDue": "Amount due",
  "overview.financial.amountPaid": "Amount paid",
  "overview.financial.tips": "Tips",
  "overview.financial.details": "Details",
  "overview.financial.empty":
    "No payment activity recorded for this location yet.",
  "overview.empty.noActivity":
    "No current vehicle activity at this location right now.",
  "overview.sections.title": "Operational sections",
  "overview.sections.sessionsDescription":
    "Current vehicles and service status.",
  "overview.sections.retrievalQueueDescription":
    "Open and accepted retrieval requests.",
  "overview.sections.tasksDescription": "Parking and retrieval task facts.",
  "overview.sections.activeShiftsDescription":
    "Current active shifts at this location.",
  "overview.sections.keysDescription":
    "Key-slot status and linked service session.",
  "overview.sections.incidentsDescription": "Current incident overview.",
  "overview.duration.minutesUnit": "m",
  "overview.duration.secondsUnit": "s",
  "overview.value.unavailable": "—",
};

export const overviewAr: OverviewStrings = {
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
  "overview.financial.empty": "لا يوجد نشاط مدفوعات مسجل لهذا الموقع بعد.",
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
};
