import type { ContextHelpCopy } from "./context-help-types";

export const helpintelligence = {
  "overview.period": {
    en: { title: "Period selector",
      body: "Choose a calendar period to constrain historical indicators. Dates are interpreted under the authorized reporting scope; changing a period does not edit past sessions." },
    ar: { title: "فترة التقرير",
      body: "اختر فترة تقويمية لتحديد المؤشرات التاريخية. تُفسّر التواريخ وفق نطاق التقرير المخوّل؛ تغيير الفترة لا يعدّل جلسات سابقة." },
  },
  "overview.metrics": {
    en: { title: "KPI cards",
      body: "These cards summarize measured activity for the selected scope and period. An unavailable or partial metric should not be interpreted as zero vehicles or guaranteed SLA success." },
    ar: { title: "المؤشرات الرئيسية",
      body: "تلخّص البطاقات النشاط المقاس للفترة والنطاق المحددين. لا تعني القيمة غير المتاحة أو الجزئية وجود صفر مركبات أو تحقق مستوى الخدمة بالضرورة." },
  },
  "overview.current": {
    en: { title: "Current activity",
      body: "This section reflects currently available operational summaries and can differ from historical period totals. Refresh reads current authorized data and does not start a task." },
    ar: { title: "النشاط الحالي",
      body: "يعرض هذا القسم الملخصات التشغيلية المتاحة حالياً وقد تختلف عن إجماليات الفترة التاريخية. يجلب التحديث بيانات مخوّلة ولا يبدأ مهمة." },
  },
  "overview.activity": {
    en: { title: "Activity chart",
      body: "Read activity trends against the selected calendar range. Missing periods and chart coverage should be checked before drawing staffing conclusions." },
    ar: { title: "رسم النشاط",
      body: "اقرأ اتجاهات النشاط ضمن المدى الزمني المختار. راجع الفترات الناقصة وتغطية الرسم قبل الاستنتاج بشأن عدد الموظفين." },
  },
  "payments.period": {
    en: { title: "Finance period",
      body: "The chosen calendar period and company/Location scope determine which financial records are summarized. Refresh never charges or refunds anyone." },
    ar: { title: "فترة التقارير المالية",
      body: "تحدد الفترة الزمنية ونطاق الشركة أو الموقع السجلات المالية الملخّصة. التحديث لا يجري تحصيلاً أو استرداداً لأي مبلغ." },
  },
  "payments.summary": {
    en: { title: "Summary cards",
      body: "Review aggregate reported financial amounts and their period context. Keep tips distinct from service fees and do not infer settlement from a dashboard total." },
    ar: { title: "الملخص المالي",
      body: "راجع إجماليات المبالغ المالية المبلّغ عنها وسياق فترتها. ميّز الإكراميات عن رسوم الخدمة ولا تستنتج تسوية نهائية من مجموع اللوحة." },
  },
  "payments.breakdown": {
    en: { title: "Breakdown table",
      body: "Detailed rows explain the visible financial categories for this scope; a missing value may reflect unavailable data rather than a zero balance." },
    ar: { title: "تفاصيل المدفوعات",
      body: "تفسر الصفوف التفصيلية الفئات المالية الظاهرة لهذا النطاق؛ غياب قيمة قد يدل على عدم توفر البيانات بدلاً من رصيد صفري." },
  },
  "analytics.period": {
    en: { title: "Period and scope",
      body: "Changing company, Location or period changes the authorized analytics query, not operational records. Compare like-for-like periods." },
    ar: { title: "الفترة والنطاق",
      body: "تغيير الشركة أو الموقع أو الفترة يغيّر استعلام التحليلات المصرّح به، لا السجلات التشغيلية. قارن فترات متماثلة." },
  },
  "analytics.cards": {
    en: { title: "Summary indicators",
      body: "Summary cards use the selected dataset and may carry missing/partial coverage. Do not treat an absent card value as measured zero." },
    ar: { title: "بطاقات المؤشرات",
      body: "تعتمد البطاقات الملخّصة على البيانات المختارة وقد تكون تغطيتها ناقصة أو جزئية. لا تعامل غياب القيمة كصفر مقاس." },
  },
  "analytics.activity": {
    en: { title: "Vehicle activity chart",
      body: "See vehicle activity through the period, subject to the source's date coverage. Trend changes do not by themselves prove a dispatch defect." },
    ar: { title: "رسم نشاط المركبات",
      body: "شاهد نشاط المركبات خلال الفترة ضمن تغطية المصدر الزمنية. تغيّر الاتجاه لا يثبت بحد ذاته وجود خلل في توزيع المهام." },
  },
  "analytics.durations": {
    en: { title: "Duration comparison and coverage",
      body: "Duration charts compare measured stages of vehicle workflow, and the coverage display explains which observations were available. Incomplete samples limit conclusions." },
    ar: { title: "المدد وتغطية البيانات",
      body: "تقارن رسوم المدد مراحل سير المركبة المقاسة، ويوضح مؤشر التغطية المشاهدات المتاحة. تحد العينات الناقصة من الاستنتاجات." },
  },
  "reports.catalog": {
    en: { title: "Report kinds",
      body: "Each available report represents a particular data view and required period. Selecting one opens a preview workflow; it does not export immediately." },
    ar: { title: "أنواع التقارير",
      body: "يمثل كل تقرير متاح عرضاً محدداً للبيانات وفترة مطلوبة. يفتح الاختيار مسار المعاينة ولا يصدّر فوراً." },
  },
  "reports.preview": {
    en: { title: "Preview dialog",
      body: "Validate the period and read the preview before any export. A loading/error preview is not a completed file." },
    ar: { title: "معاينة التقرير",
      body: "تحقق من الفترة واقرأ المعاينة قبل التصدير. المعاينة التي ما زالت تُحمّل أو تعرض خطأ ليست ملفاً مكتملاً." },
  },
  "reports.export": {
    en: { title: "Export actions",
      body: "CSV/PDF export is available only under current entitlements and approved scope. Avoid repeating a request whose response is unknown without reconciling its result." },
    ar: { title: "تصدير التقارير",
      body: "يتاح تصدير CSV/PDF فقط ضمن صلاحيات الاشتراك والنطاق المعتمدين. تجنّب إعادة طلب نتيجته غير معروفة قبل التحقق منها." },
  },
} as const satisfies Record<string, ContextHelpCopy>;
