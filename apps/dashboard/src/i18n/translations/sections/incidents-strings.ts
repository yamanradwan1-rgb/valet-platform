/**
 * Current-incidents monitoring surface strings (D2-004).
 */

export interface IncidentsStrings {
  "page.incidents.title": string;
  "page.incidents.description": string;
  "page.incidents.empty": string;
  "page.incidents.kpiVisible": string;
  "page.incidents.kpiHighCritical": string;
  "page.incidents.monitoringNote": string;
  "page.incidents.column.incidentId": string;
  "page.incidents.column.sessionId": string;
  "page.incidents.column.status": string;
  "page.incidents.column.severity": string;
  "page.incidents.column.type": string;
  "page.incidents.column.createdAt": string;
  "page.incidents.column.resolvedAt": string;
  "page.incidents.detailTitle": string;
  "page.incidents.field.description": string;
  "page.incidents.field.rawType": string;
  "page.incidents.unresolved": string;
}

export const incidentsEn: IncidentsStrings = {
  "page.incidents.title": "Incidents",
  "page.incidents.description":
    "Current open and investigating incidents at this location. Read-only monitoring.",
  "page.incidents.empty": "No open or investigating incidents right now.",
  "page.incidents.kpiVisible": "Incidents currently listed",
  "page.incidents.kpiHighCritical": "High / critical among listed",
  "page.incidents.monitoringNote":
    "Read-only monitoring of current incidents: this view lists OPEN and INVESTIGATING cases only, and resolved or closed incidents leave it. Creation, evidence, resolution and closing are handled outside the Management Dashboard.",
  "page.incidents.column.incidentId": "Incident ID",
  "page.incidents.column.sessionId": "Session ID",
  "page.incidents.column.status": "Status",
  "page.incidents.column.severity": "Severity",
  "page.incidents.column.type": "Type",
  "page.incidents.column.createdAt": "Created",
  "page.incidents.column.resolvedAt": "Resolved",
  "page.incidents.detailTitle": "Incident detail",
  "page.incidents.field.description": "Description",
  "page.incidents.field.rawType": "Recorded type",
  "page.incidents.unresolved": "Unresolved",
};

export const incidentsAr: IncidentsStrings = {
  "page.incidents.title": "الحوادث",
  "page.incidents.description":
    "الحوادث المفتوحة وقيد المراجعة حاليًا في هذا الموقع. مراقبة للقراءة فقط.",
  "page.incidents.empty": "لا توجد حوادث مفتوحة أو قيد المراجعة حاليًا.",
  "page.incidents.kpiVisible": "الحوادث المعروضة حاليًا",
  "page.incidents.kpiHighCritical": "مرتفعة / حرجة ضمن المعروض",
  "page.incidents.monitoringNote":
    "عرض مباشر للقراءة فقط للحوادث الحالية: تعرض هذه الواجهة الحالات المفتوحة وقيد المراجعة فقط، وتخرج منها الحوادث المعالجة أو المغلقة. إنشاء الحوادث والأدلة والمعالجة والإغلاق تُدار خارج لوحة الإدارة.",
  "page.incidents.column.incidentId": "معرّف الحادث",
  "page.incidents.column.sessionId": "معرّف العملية",
  "page.incidents.column.status": "الحالة",
  "page.incidents.column.severity": "الخطورة",
  "page.incidents.column.type": "النوع",
  "page.incidents.column.createdAt": "أُنشئ في",
  "page.incidents.column.resolvedAt": "عولجت في",
  "page.incidents.detailTitle": "تفاصيل الحادث",
  "page.incidents.field.description": "الوصف",
  "page.incidents.field.rawType": "النوع المسجّل",
  "page.incidents.unresolved": "غير معالجة",
};
