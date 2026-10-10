import type { ContextHelpCopy } from "./context-help-types";

export const helppresence = {
  "setting.operatingHours": {
    en: { title: "Weekly operating hours",
      body: "Configure each weekday's open/closed state and opening/closing times, then Save the seven-day schedule as one operation. A closed day is not an absent record; a Location override may be cleared to inherit company hours, and hours do not start/end staff Shifts automatically." },
    ar: { title: "ساعات العمل الأسبوعية",
      body: "اضبط حالة الفتح والإغلاق وأوقاتهما لكل يوم، ثم احفظ الجدول الأسبوعي بأكمله بعملية واحدة. اليوم المغلق ليس سجلاً مفقوداً؛ ويمكن إزالة استثناء الموقع ليرث ساعات الشركة، ولا تبدأ ساعات العمل ورديات الموظفين أو تنهيها تلقائياً." },
  },
  "setting.slaTargetSeconds": {
    en: { title: "Location SLA target",
      body: "Set this Location's target in seconds within the existing validated 30–3600 range. It is a monitoring target, not a guarantee of retrieval time or a Company-default editor; Clear removes the Location value where permitted." },
    ar: { title: "هدف مستوى الخدمة للموقع",
      body: "اضبط هدف مستوى الخدمة لهذا الموقع بالثواني ضمن المجال المعتمد من 30 إلى 3600. هو هدف للمراقبة وليس ضماناً لوقت الاسترجاع أو محرراً لقيمة الشركة؛ وتمسح الإزالة قيمة الموقع عند السماح بها." },
  },
  "policies.presence": {
    en: { title: "Shift presence policies",
      body: "These rules validate shift start/end presence under current Company defaults and Location overrides. They are point-in-time eligibility checks, not continuous employee GPS tracking; read current readiness before strict enforcement." },
    ar: { title: "سياسات حضور الورديات",
      body: "تتحقق هذه القواعد من الحضور عند بدء الوردية أو نهايتها بحسب قيم الشركة واستثناءات الموقع. هي فحوص أهلية لحظية وليست تتبع GPS دائماً للموظف؛ راجع جاهزية الموقع قبل تطبيق الوضع الصارم." },
  },
  "presence.shiftStartPresenceMode": {
    en: { title: "Shift start presence check",
      body: "Choose the supported presence-check mode for starting a Shift. The actual result depends on current Location policy, permission and verified location evidence; setting a stricter mode does not fabricate a valid fix." },
    ar: { title: "التحقق عند بدء الوردية",
      body: "اختر وضع التحقق من الحضور المدعوم عند بدء الوردية. تعتمد النتيجة الفعلية على سياسة الموقع والأذونات ودليل الموقع المتحقق منه؛ اختيار وضع أكثر صرامة لا ينشئ قراءة موقع صالحة." },
  },
  "presence.shiftEndPresenceMode": {
    en: { title: "Shift end presence check",
      body: "Choose the supported presence-check mode for ending a Shift. Ending a Shift remains subject to open-task handoff and supervisor authorization even if a location reading passes." },
    ar: { title: "التحقق عند إنهاء الوردية",
      body: "اختر وضع التحقق من الحضور المدعوم عند إنهاء الوردية. يبقى إنهاء الوردية خاضعاً لتسليم المهام المفتوحة وصلاحيات المشرف حتى عند نجاح قراءة الموقع." },
  },
  "presence.shiftPresenceMaxAccuracyMeters": {
    en: { title: "Maximum location uncertainty",
      body: "Set the greatest allowed reported location uncertainty in meters for a presence check. A lower threshold is stricter; poor GPS accuracy may prevent confirmation without indicating employee misconduct." },
    ar: { title: "الحد الأقصى لعدم دقة الموقع",
      body: "حدّد الحد الأعلى المسموح لعدم دقة الموقع المبلّغ عنه بالأمتار. الحد الأصغر أكثر صرامة؛ قد تمنع دقة GPS الضعيفة التأكيد دون أن تعني مخالفة من الموظف." },
  },
  "presence.shiftPresenceMaxFixAgeSeconds": {
    en: { title: "Maximum location fix age",
      body: "Set the maximum age, in seconds, of a location fix accepted for presence. Older cached readings are not proof of present attendance; this does not change the schedule of background tracking." },
    ar: { title: "الحد الأقصى لعمر قراءة الموقع",
      body: "حدّد أقصى عمر مسموح لقراءة الموقع بالثواني عند التحقق من الحضور. القراءة المخزّنة القديمة لا تثبت الحضور الحالي؛ ولا يغيّر هذا الجدول الزمني لأي تتبع خلفي." },
  },
  "presence.readiness": {
    en: { title: "Presence readiness",
      body: "Read effective start/end modes, active zone count, blockers and observation time before enforcing strict checks. Readiness is an observed configuration verdict; it is not a Save control or a guarantee that every phone can obtain an accurate fix." },
    ar: { title: "جاهزية التحقق من الحضور",
      body: "اقرأ أوضاع البدء والنهاية الفعلية وعدد المناطق النشطة والعوائق ووقت الملاحظة قبل فرض التحقق الصارم. الجاهزية نتيجة فحص للإعدادات وليست زر حفظ أو ضماناً لحصول كل هاتف على موقع دقيق." },
  },
  "presence.zones": {
    en: { title: "Attendance zones",
      body: "Attendance zones define where authorized shift presence may be validated. A configured shape is not a record of where a staff member travelled and is separate from parking zones." },
    ar: { title: "مناطق الحضور",
      body: "تحدد مناطق الحضور الأماكن التي يمكن التحقق فيها من وجود الموظف عند الوردية. الشكل المهيأ ليس سجلاً لمسار الموظف وهو منفصل عن مناطق ركن المركبات." },
  },
  "presence.zoneForm": {
    en: { title: "Create or edit attendance zone",
      body: "Define a presence zone's supported shape and fields, review map position, then explicitly save with current revision. Do not assume a drawn area grants a staff Location membership or that unsaved geometry is active." },
    ar: { title: "إنشاء وتعديل منطقة حضور",
      body: "حدد شكل منطقة الحضور وحقولها المدعومة وراجع موضعها على الخريطة، ثم احفظها صراحة وفق الإصدار الحالي. رسم المنطقة لا يمنح الموظف عضوية موقع، كما أن الشكل غير المحفوظ غير نشط." },
  },
  "presence.exceptions": {
    en: { title: "Presence exceptions",
      body: "Review reported presence exceptions for this Location using current scope. An exception is not automatic approval or proof of wrongdoing; it requires the existing authorized resolution process." },
    ar: { title: "استثناءات الحضور",
      body: "راجع استثناءات الحضور المبلّغ عنها لهذا الموقع ضمن نطاقك الحالي. الاستثناء ليس موافقة تلقائية أو دليلاً على مخالفة؛ بل يخضع لمسار المعالجة المصرّح به." },
  },
  "presence.review": {
    en: { title: "Review presence exception",
      body: "Examine recorded evidence, current status and permitted review action before confirming an exception. Stale revisions, revocation and unknown mutation outcomes must be handled through the existing guarded recovery flow." },
    ar: { title: "مراجعة استثناء الحضور",
      body: "افحص الأدلة المسجلة والحالة الحالية وإجراء المراجعة المسموح قبل اعتماد الاستثناء. تُعالج الإصدارات القديمة وإلغاء الصلاحية ونتائج العمليات غير المؤكدة عبر مسار الاستعادة المحمي الموجود." },
  },
  "services.status": {
    en: { title: "Service status",
      body: "Service health is an observed technical status, not a tenant-level switch. There is no Save here; a service reported healthy may still require credentials, entitlements or per-Location configuration elsewhere." },
    ar: { title: "حالة الخدمات",
      body: "حالة الخدمة هي ملاحظة تقنية وليست مفتاح تشغيل خاصاً بالشركة. لا يوجد حفظ هنا؛ قد تحتاج الخدمة السليمة إلى بيانات اعتماد أو اشتراك أو تهيئة خاصة بالموقع في موضع آخر." },
  },
} as const satisfies Record<string, ContextHelpCopy>;
