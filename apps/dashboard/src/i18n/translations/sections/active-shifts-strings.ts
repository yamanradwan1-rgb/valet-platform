/**
 * Active shifts monitoring surface strings (D2-004).
 */

export interface ActiveShiftsStrings {
  "page.activeShifts.title": string;
  "page.activeShifts.description": string;
  "page.activeShifts.empty": string;
  "page.activeShifts.kpiLabel": string;
  "page.activeShifts.kpiSub": string;
  "page.activeShifts.scopeNote": string;
  "page.activeShifts.column.shiftId": string;
  "page.activeShifts.column.membershipId": string;
  "page.activeShifts.column.startedAt": string;
  "page.activeShifts.rowSubtitle": string;
}

export const activeShiftsEn: ActiveShiftsStrings = {
  "page.activeShifts.title": "Active Shifts",
  "page.activeShifts.description": "Current active shifts at this location.",
  "page.activeShifts.empty": "No active shifts at this location right now.",
  "page.activeShifts.kpiLabel": "Active shifts shown",
  "page.activeShifts.kpiSub":
    "Counts rows loaded so far; Load more extends the list.",
  "page.activeShifts.scopeNote":
    "Lists active shifts with their shift ID, membership ID and start time only. Employee names, performance and task totals are not part of this backend view.",
  "page.activeShifts.column.shiftId": "Shift ID",
  "page.activeShifts.column.membershipId": "Membership ID",
  "page.activeShifts.column.startedAt": "Started at",
  "page.activeShifts.rowSubtitle": "Active shift",
};

export const activeShiftsAr: ActiveShiftsStrings = {
  "page.activeShifts.title": "المناوبات النشطة",
  "page.activeShifts.description": "المناوبات النشطة حاليًا في هذا الموقع.",
  "page.activeShifts.empty": "لا توجد مناوبات نشطة في هذا الموقع حاليًا.",
  "page.activeShifts.kpiLabel": "المناوبات النشطة المعروضة",
  "page.activeShifts.kpiSub":
    "تحسب الصفوف المحمّلة حتى الآن؛ «تحميل المزيد» يوسّع القائمة.",
  "page.activeShifts.scopeNote":
    "تعرض هذه الصفحة المناوبات النشطة بمعرّف المناوبة ومعرّف العضوية ووقت البدء فقط. أسماء الموظفين ومؤشرات الأداء وإجماليات المهام ليست جزءًا من هذه الواجهة الخلفية.",
  "page.activeShifts.column.shiftId": "معرّف المناوبة",
  "page.activeShifts.column.membershipId": "معرّف العضوية",
  "page.activeShifts.column.startedAt": "بدأت في",
  "page.activeShifts.rowSubtitle": "مناوبة نشطة",
};
