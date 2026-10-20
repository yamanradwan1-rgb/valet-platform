import type { InvestigationDemoQuery } from "../../investigation-demo-types";

/** Frozen Concept A form labels and window validation, unchanged for Demo. */
export const investigationPanelCopy = {
  en: {
    title: "Find Sessions",
    subtitle: "Event time window · same Location · all filters combined",
    clear: "Clear",
    collapse: "Collapse filters",
    expand: "Show filters",
    apply: "Apply search ↗",
    location: "Location",
    locationName: "VAYLET Pilot North",
    date: "Event date",
    start: "From · inclusive",
    end: "To · exclusive",
    slot: "Key slot",
    employee: "Employee involvement",
    anyEmployee: "Any employee",
    make: "Make · current",
    model: "Model · current",
    plate: "Plate · current",
    sessionId: "Exact Session ID",
    truth:
      "Key/employee witnesses can be separate events. Search does not prove continuous custody, causality, or a historical name/vehicle snapshot.",
    timeError: "Choose a valid date and start time earlier than the end time.",
  },
  ar: {
    title: "البحث عن الجلسات",
    subtitle: "نافذة توقيت الحدث · موقع واحد · جمع الشروط",
    clear: "مسح",
    collapse: "طي المرشحات",
    expand: "إظهار المرشحات",
    apply: "تطبيق البحث ↗",
    location: "الموقع",
    locationName: "فايلت - الموقع التجريبي الشمالي",
    date: "تاريخ الحدث",
    start: "من · شامل",
    end: "إلى · غير شامل",
    slot: "خانة المفتاح",
    employee: "مشاركة الموظف",
    anyEmployee: "أي موظف",
    make: "الشركة · الحالية",
    model: "الطراز · الحالي",
    plate: "اللوحة · الحالية",
    sessionId: "معرّف الجلسة الدقيق",
    truth:
      "قد تظهر أدلة المفتاح والموظف في حدثين منفصلين؛ البحث لا يثبت الحيازة المستمرة أو السببية أو هوية تاريخية ثابتة.",
    timeError: "اختر تاريخًا صالحًا ووقت بداية يسبق وقت النهاية.",
  },
} as const;

export function hasValidInvestigationWindow(
  query: InvestigationDemoQuery,
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(query.date)) return false;
  const date = new Date(query.date + "T00:00:00Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== query.date
  ) {
    return false;
  }
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  return (
    timePattern.test(query.start) &&
    timePattern.test(query.end) &&
    query.start < query.end
  );
}
