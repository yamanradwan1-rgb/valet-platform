import type { ContextHelpCopy } from "./context-help-types";

export const helpoperations = {
  "live.kpis": {
    en: { title: "Live counts",
      body: "Counts group current vehicle-session states, not employee productivity or final settlement. Status may change after the snapshot; revalidate before acting elsewhere." },
    ar: { title: "الأعداد المباشرة",
      body: "تجمع الأعداد حالات جلسات المركبات الحالية، وليست قياساً لإنتاجية الموظفين أو تسوية مالية نهائية. قد تتغير الحالة بعد أخذ اللقطة؛ أعد التحقق قبل أي إجراء." },
  },
  "live.sessions": {
    en: { title: "Sessions/filter table",
      body: "Filter sessions by displayed workflow states and page through the authorized Location snapshot. A queued task, physical Parking status and handoff status are separate concepts." },
    ar: { title: "جدول الجلسات والفلاتر",
      body: "صفِّ الجلسات بحسب الحالات المعروضة وتنقل عبر صفحات لقطة الموقع المصرّح بها. المهمة المنتظرة وحالة الركن الفعلية وحالة التسليم مفاهيم منفصلة." },
  },
  "live.retrieval": {
    en: { title: "Retrieval queue view",
      body: "The retrieval queue shows active requests and dispatch progress for the selected Location. Opening or refreshing this view does not create another retrieval request or accept a task." },
    ar: { title: "طابور الاسترجاع",
      body: "يعرض طابور الاسترجاع الطلبات النشطة وتقدم توزيع المهام في الموقع المحدد. فتح العرض أو تحديثه لا ينشئ طلب استرجاع جديداً ولا يقبل مهمة." },
  },
  "live.sessionDetail": {
    en: { title: "Session details",
      body: "Review authorized vehicle, status and custody facts. Checked In By is the original check-in association, not proof of who finished each check-in step. Parked By identifies a historical Parking actor only when completion evidence is verified; an unknown name for a verified actor, no completion record and conflicting evidence are distinct outcomes. The current task assignee is a separate fact." },
    ar: { title: "تفاصيل الجلسة",
      body: "راجع بيانات المركبة والحالة والحيازة المخوّل بعرضها. يشير «المسجّل عند الدخول» إلى ارتباط الدخول الأصلي وليس إثباتاً لمن أنهى كل خطوة. ولا تُنسب عملية الركن التاريخية إلى موظف إلا عند تحقق دليل إتمامها؛ اسم غير معروف لفاعل مثبت يختلف عن غياب سجل الإتمام أو تضارب الأدلة. والموظف المكلّف بالمهمة الحالية حقيقة منفصلة." },
  },
  "vehicles.search": {
    en: { title: "Vehicle search and status",
      body: "Search the currently loaded vehicle page by displayed identity and use its state filter. A missing match here may exist on another page or outside your authorized Location." },
    ar: { title: "بحث المركبات وحالاتها",
      body: "ابحث ضمن صفحة المركبات المحمّلة باستخدام الهوية المعروضة وصفِّ حسب الحالة. قد توجد المركبة في صفحة أخرى أو خارج موقعك المصرّح به." },
  },
  "vehicles.table": {
    en: { title: "Session rows",
      body: "Each row shows a vehicle session and its displayed state and update time. Detail access is read-only and follows current Location authorization." },
    ar: { title: "صفوف الجلسات",
      body: "يعرض كل صف جلسة مركبة وحالتها ووقت تحديثها. فتح التفاصيل للقراءة فقط ويخضع لصلاحية الموقع الحالية." },
  },
  "vehicles.drawer": {
    en: { title: "Vehicle details",
      body: "Read the selected session's authorized facts; these do not permit changing its physical custody or overriding pickup verification." },
    ar: { title: "تفاصيل المركبة",
      body: "اقرأ بيانات الجلسة المحددة المصرّح بها؛ عرضها لا يسمح بتغيير الحيازة الفعلية أو تجاوز تحقق الاستلام." },
  },
  "tasks.filters": {
    en: { title: "Task status",
      body: "Task state such as QUEUED, ASSIGNED, ACCEPTED or IN_PROGRESS describes dispatch work, not physical vehicle release. Filter changes never change assignment." },
    ar: { title: "فلاتر حالة المهام",
      body: "تصف حالات المهمة مثل الانتظار والإسناد والقبول والتنفيذ سير التوزيع، لا تسليم المركبة فعلياً. تغيير الفلتر لا يغيّر التكليف." },
  },
  "tasks.table": {
    en: { title: "Task list",
      body: "The list is a page of existing tasks in the selected Location. Inspect task type and status before interpreting the associated session; older completed tasks remain history." },
    ar: { title: "قائمة المهام",
      body: "القائمة صفحة من المهام الموجودة في الموقع المحدد. راجع نوع المهمة وحالتها قبل تفسير الجلسة المرتبطة؛ وتبقى المهام المكتملة سابقاً جزءاً من التاريخ." },
  },
  "tasks.drawer": {
    en: { title: "Task details",
      body: "Details identify the selected task and its currently reported assignment/progress. Viewing details is not the employee's Accept, Start or Continue action." },
    ar: { title: "تفاصيل المهمة",
      body: "تحدد التفاصيل المهمة المختارة وتكليفها وتقدمها المُبلّغ عنه حالياً. عرض التفاصيل ليس إجراء الموظف لقبول المهمة أو بدئها أو استكمالها." },
  },
  "maps.mode": {
    en: { title: "Live / Setup",
      body: "Live shows task-location observations; Setup displays editable Location map configuration only for authorized roles. Switching modes never starts employee GPS tracking." },
    ar: { title: "الوضع المباشر والإعداد",
      body: "يعرض الوضع المباشر ملاحظات الموقع المرتبطة بالمهام؛ أما الإعداد فيعرض تهيئة خريطة الموقع القابلة للتعديل للأدوار المخوّلة فقط. التبديل لا يبدأ تتبع GPS للموظف." },
  },
  "maps.live": {
    en: { title: "Tracked map",
      body: "Live and stale markers mean different freshness levels. No marker is not proof a vehicle is missing; tracking is limited by task/policy/permission/signal." },
    ar: { title: "الخريطة المباشرة",
      body: "تختلف العلامات المباشرة والقديمة في حداثة البيانات. غياب العلامة لا يثبت فقدان مركبة؛ فالتتبع مرتبط بالمهمة والسياسة والأذونات والإشارة." },
  },
  "maps.setup": {
    en: { title: "Map areas and points",
      body: "Configure authorized map points and areas for the selected Location using the existing editor. Geometry changes are subject to validation and must not be mistaken for recorded physical movements." },
    ar: { title: "إعداد الخريطة",
      body: "هيّئ النقاط والمناطق المصرّح بها للموقع المحدد عبر المحرّر الموجود. تخضع تغييرات الأشكال للتحقق ولا تمثل سجلاً لتحركات المركبات الفعلية." },
  },
  "maps.legend": {
    en: { title: "Freshness legend",
      body: "The legend distinguishes live, stale and, where shown, inactive map elements. The color is a display classification, not a guaranteed arrival time." },
    ar: { title: "مفتاح العلامات",
      body: "يميز المفتاح بين العناصر المباشرة والقديمة وغير النشطة عند عرضها. اللون تصنيف للعرض وليس وعداً بوقت وصول." },
  },
  "keys.operational": {
    en: { title: "Operational key custody",
      body: "Review which key slots are currently available, occupied or otherwise operationally flagged. Current slot state and past checkout/return events must not be conflated." },
    ar: { title: "تبويب حالة المفاتيح",
      body: "راجع خانات المفاتيح المتاحة أو المشغولة أو المعلّمة تشغيلياً. لا تخلط بين حالة الخانة الحالية وأحداث سحب المفتاح وإرجاعه السابقة." },
  },
  "keys.configuration": {
    en: { title: "Physical resource configuration",
      body: "Authorized editors manage physical parking/key resources here. QR/slot association does not allow one active key slot to be assigned to two vehicles." },
    ar: { title: "تبويب تهيئة الموارد",
      body: "يدير أصحاب الصلاحية موارد المفاتيح والمواقف من هنا. لا يتيح ربط الخانة أو رمز QR تخصيص الخانة النشطة نفسها لمركبتين." },
  },
  "keys.resourceDetails": {
    en: { title: "Resource create/edit/label dialogs",
      body: "Review type, Location and any current-use restrictions before saving a physical resource. Printing labels or editing configuration does not repair historical custody records." },
    ar: { title: "تفاصيل الموارد",
      body: "راجع نوع المورد وموقعه وقيود استخدامه الحالية قبل الحفظ. طباعة الملصقات أو تعديل الإعدادات لا يصلح سجلات الحيازة التاريخية." },
  },
  "incidents.list": {
    en: { title: "Incident table",
      body: "Find incidents visible in this Location and inspect their reported status. A reported incident must not be read as an adjudicated customer claim." },
    ar: { title: "قائمة البلاغات",
      body: "اعثر على بلاغات الحوادث الظاهرة في هذا الموقع وراجع حالتها المُبلّغ عنها. البلاغ لا يعني حسم مطالبة العميل قانونياً." },
  },
  "incidents.detail": {
    en: { title: "Incident drawer",
      body: "Details describe the recorded incident and permitted evidence references. The original report is not silently edited to resolve a disagreement." },
    ar: { title: "تفاصيل البلاغ",
      body: "تصف التفاصيل البلاغ المسجّل ومراجع الأدلة المسموح بها. لا يُعدّل البلاغ الأصلي بصمت عند وجود خلاف." },
  },
} as const satisfies Record<string, ContextHelpCopy>;
