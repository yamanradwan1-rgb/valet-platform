/**
 * Analytics surface strings (D4-001).
 */

export interface AnalyticsStrings {
  "analytics.infoNote": string;
  "analytics.loading": string;
  "analytics.action.retry": string;
  "analytics.error.loadFailed": string;
  "analytics.error.network": string;
  "analytics.error.accessDenied": string;
  "analytics.value.unavailable": string;
  "analytics.period.from": string;
  "analytics.period.to": string;
  "analytics.period.apply": string;
  "analytics.period.hint": string;
  "analytics.period.locationTimezoneLabel": string;
  "analytics.period.reportedLabel": string;
  "analytics.period.appliedDays": string;
  "analytics.period.errorFormat": string;
  "analytics.period.errorOrder": string;
  "analytics.period.errorRange": string;
  "analytics.tab.operations": string;
  "analytics.tab.financial": string;
  "analytics.tab.incidents": string;
  "analytics.duration.minutesUnit": string;
  "analytics.duration.secondsUnit": string;
  "analytics.ops.checkInTime": string;
  "analytics.ops.parkingTime": string;
  "analytics.ops.retrievalWait": string;
  "analytics.ops.retrievalStartLatencyAuxiliary": string;
  "analytics.ops.handoffTime": string;
  "analytics.ops.samplesCount": string;
  "analytics.ops.carsHandledTitle": string;
  "analytics.ops.carsEmpty": string;
  "analytics.ops.queueTitle": string;
  "analytics.queue.depth": string;
  "analytics.queue.oldestWait": string;
  "analytics.queue.snapshotNote": string;
  "analytics.fin.currencyGroupLabel": string;
  "analytics.fin.paidPayments": string;
  "analytics.fin.collected": string;
  "analytics.fin.tips": string;
  "analytics.fin.succeededRefunds": string;
  "analytics.fin.digitalRate": string;
  "analytics.fin.validationRate": string;
  "analytics.fin.validatedAmount": string;
  "analytics.fin.empty": string;
  "analytics.fin.cashReconciliationTitle": string;
  "analytics.fin.cashCurrency": string;
  "analytics.fin.cashExpected": string;
  "analytics.fin.cashReported": string;
  "analytics.fin.cashVariance": string;
  "analytics.fin.cashEmpty": string;
  "analytics.inc.incidentRateTitle": string;
  "analytics.inc.totalIncidents": string;
  "analytics.inc.per1000": string;
  "analytics.inc.severityTitle": string;
  "analytics.inc.typeTitle": string;
  "analytics.inc.empty": string;
}

export const analyticsEn: AnalyticsStrings = {
  "analytics.infoNote":
    "Only metrics backed by the selected period are shown. Empty samples display “—”, currencies stay separate, and backend-computed rates are displayed as reported.",
  "analytics.loading": "Loading analytics…",
  "analytics.action.retry": "Retry",
  "analytics.error.loadFailed":
    "We couldn't load analytics right now. Please try again.",
  "analytics.error.network":
    "Network connection unavailable. Check your connection and try again.",
  "analytics.error.accessDenied":
    "You don't have access to this location's analytics.",
  "analytics.value.unavailable": "—",
  "analytics.period.from": "From",
  "analytics.period.to": "To",
  "analytics.period.apply": "Apply period",
  "analytics.period.hint":
    "Inclusive local dates · maximum 31 days · resolved in the location timezone.",
  "analytics.period.locationTimezoneLabel": "Location timezone",
  "analytics.period.reportedLabel": "Backend-reported period",
  "analytics.period.appliedDays": "Applied period (days)",
  "analytics.period.errorFormat": "Select valid calendar dates.",
  "analytics.period.errorOrder": "The From date must be on or before the To date.",
  "analytics.period.errorRange": "The period can cover at most 31 days.",
  "analytics.tab.operations": "Operations",
  "analytics.tab.financial": "Financial",
  "analytics.tab.incidents": "Incidents",
  "analytics.duration.minutesUnit": "m",
  "analytics.duration.secondsUnit": "s",
  "analytics.ops.checkInTime": "Check-in time",
  "analytics.ops.parkingTime": "Parking time",
  "analytics.ops.retrievalWait": "Retrieval wait time",
  "analytics.ops.retrievalStartLatencyAuxiliary":
    "Retrieval start latency · auxiliary",
  "analytics.ops.handoffTime": "Vehicle handoff time",
  "analytics.ops.samplesCount": "Samples",
  "analytics.ops.carsHandledTitle": "Cars handled per local day",
  "analytics.ops.carsEmpty": "No cars-handled facts were returned for this period.",
  "analytics.ops.queueTitle": "Current retrieval queue",
  "analytics.queue.depth": "Queue depth",
  "analytics.queue.oldestWait": "Oldest request wait",
  "analytics.queue.snapshotNote":
    "Current snapshot only; not a historical reconstruction.",
  "analytics.fin.currencyGroupLabel": "Currency group",
  "analytics.fin.paidPayments": "Paid payments",
  "analytics.fin.collected": "Collected",
  "analytics.fin.tips": "Tips",
  "analytics.fin.succeededRefunds": "Succeeded refunds",
  "analytics.fin.digitalRate": "Digital payment rate",
  "analytics.fin.validationRate": "Validation rate",
  "analytics.fin.validatedAmount": "Current validation amount",
  "analytics.fin.empty": "No financial analytics were recorded for this period.",
  "analytics.fin.cashReconciliationTitle": "Cash reconciliation",
  "analytics.fin.cashCurrency": "Currency",
  "analytics.fin.cashExpected": "Cash expected",
  "analytics.fin.cashReported": "Cash reported",
  "analytics.fin.cashVariance": "Variance",
  "analytics.fin.cashEmpty":
    "No cash reconciliation entries were returned for this period.",
  "analytics.inc.incidentRateTitle": "Incident rate",
  "analytics.inc.totalIncidents": "Total incidents",
  "analytics.inc.per1000": "Incidents per 1,000 completed sessions",
  "analytics.inc.severityTitle": "By severity",
  "analytics.inc.typeTitle": "By incident type",
  "analytics.inc.empty": "No incidents were recorded for this period.",
};

export const analyticsAr: AnalyticsStrings = {
  "analytics.infoNote":
    "تُعرض المقاييس المدعومة بالفترة المحددة فقط. العينات الفارغة تظهر كـ \"—\"، وتبقى العملات منفصلة، وتُعرض النسب المحسوبة من الخادم كما وردت تمامًا.",
  "analytics.loading": "جارٍ تحميل التحليلات…",
  "analytics.action.retry": "إعادة المحاولة",
  "analytics.error.loadFailed": "تعذر تحميل التحليلات الآن. حاول مرة أخرى.",
  "analytics.error.network":
    "اتصال الشبكة غير متاح. تحقق من اتصالك وحاول مرة أخرى.",
  "analytics.error.accessDenied":
    "ليس لديك صلاحية الوصول إلى تحليلات هذا الموقع.",
  "analytics.value.unavailable": "—",
  "analytics.period.from": "من",
  "analytics.period.to": "إلى",
  "analytics.period.apply": "تطبيق الفترة",
  "analytics.period.hint":
    "تواريخ محلية شاملة · 31 يومًا كحد أقصى · تُحلّ حسب المنطقة الزمنية للموقع.",
  "analytics.period.locationTimezoneLabel": "المنطقة الزمنية للموقع",
  "analytics.period.reportedLabel": "الفترة المُبلَّغة من الخادم",
  "analytics.period.appliedDays": "الفترة المطبقة (أيام)",
  "analytics.period.errorFormat": "اختر تواريخ صحيحة.",
  "analytics.period.errorOrder": "يجب أن يكون تاريخ \"من\" في نفس تاريخ \"إلى\" أو قبله.",
  "analytics.period.errorRange": "يمكن أن تغطي الفترة 31 يومًا كحد أقصى.",
  "analytics.tab.operations": "التشغيل",
  "analytics.tab.financial": "المالية",
  "analytics.tab.incidents": "الحوادث",
  "analytics.duration.minutesUnit": "د",
  "analytics.duration.secondsUnit": "ث",
  "analytics.ops.checkInTime": "زمن تسجيل الوصول",
  "analytics.ops.parkingTime": "زمن الركن",
  "analytics.ops.retrievalWait": "زمن انتظار الاسترجاع",
  "analytics.ops.retrievalStartLatencyAuxiliary": "زمن بدء الاسترجاع · مساعد",
  "analytics.ops.handoffTime": "زمن تسليم المركبة",
  "analytics.ops.samplesCount": "العينات",
  "analytics.ops.carsHandledTitle": "المركبات المعالجة لكل يوم محلي",
  "analytics.ops.carsEmpty": "لا توجد بيانات مركبات معالجة لهذه الفترة.",
  "analytics.ops.queueTitle": "قائمة الاسترجاع الحالية",
  "analytics.queue.depth": "عمق القائمة",
  "analytics.queue.oldestWait": "أطول انتظار لطلب",
  "analytics.queue.snapshotNote": "لقطة حالية فقط؛ وليست إعادة بناء تاريخية.",
  "analytics.fin.currencyGroupLabel": "مجموعة العملة",
  "analytics.fin.paidPayments": "المدفوعات المسددة",
  "analytics.fin.collected": "المبالغ المحصلة",
  "analytics.fin.tips": "الإكراميات",
  "analytics.fin.succeededRefunds": "المبالغ المستردة الناجحة",
  "analytics.fin.digitalRate": "نسبة الدفع الإلكتروني",
  "analytics.fin.validationRate": "نسبة التحقق",
  "analytics.fin.validatedAmount": "مبلغ التحقق الحالي",
  "analytics.fin.empty": "لا توجد تحليلات مالية مسجلة لهذه الفترة.",
  "analytics.fin.cashReconciliationTitle": "مطابقة النقد",
  "analytics.fin.cashCurrency": "العملة",
  "analytics.fin.cashExpected": "النقد المتوقع",
  "analytics.fin.cashReported": "النقد المُبلَّغ",
  "analytics.fin.cashVariance": "الفرق",
  "analytics.fin.cashEmpty": "لا توجد إدخالات مطابقة نقد لهذه الفترة.",
  "analytics.inc.incidentRateTitle": "معدل الحوادث",
  "analytics.inc.totalIncidents": "إجمالي الحوادث",
  "analytics.inc.per1000": "الحوادث لكل 1,000 جلسة مكتملة",
  "analytics.inc.severityTitle": "حسب الخطورة",
  "analytics.inc.typeTitle": "حسب نوع الحادث",
  "analytics.inc.empty": "لم تُسجَّل أي حوادث لهذه الفترة.",
};
