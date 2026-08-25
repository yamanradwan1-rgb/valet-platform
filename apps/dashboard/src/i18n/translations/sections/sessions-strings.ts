/**
 * Sessions / Vehicles in Service surface strings (D2-003).
 */

export interface SessionsStrings {
  "page.sessions.title": string;
  "page.sessions.description": string;
  "page.sessions.contractNote": string;
  "sessions.filterGroup": string;
  "sessions.filterAll": string;
  "sessions.filterScopeHint": string;
  "sessions.column.vehicle": string;
  "sessions.column.state": string;
  "sessions.column.created": string;
  "sessions.column.updated": string;
  "sessions.column.parkingSpotId": string;
  "sessions.column.keySlotId": string;
  "sessions.column.assignee": string;
  "sessions.empty": string;
  "sessions.detail.title": string;
  "sessions.detail.sessionId": string;
  "sessions.detail.vehicleId": string;
  "sessions.detail.plateNumber": string;
  "sessions.detail.plateCountry": string;
  "sessions.detail.temporaryDescriptor": string;
  "sessions.detail.state": string;
  "sessions.detail.createdAt": string;
  "sessions.detail.updatedAt": string;
  "sessions.detail.parkingSpotId": string;
  "sessions.detail.keySlotId": string;
  "sessions.detail.assigneeMembershipId": string;
  "sessions.fallback.unnamedVehicle": string;
}

export const sessionsEn: SessionsStrings = {
  "page.sessions.title": "Vehicles in Service",
  "page.sessions.description":
    "Each current service session, vehicle reference, status, parking spot, key slot and current assignee when available.",
  "page.sessions.contractNote":
    "Shows each current service session, vehicle reference, status, parking spot, key slot and current assignee when available. Customer details and the full session timeline are not shown here; completed sessions are not part of this view.",
  "sessions.filterGroup": "Filter by state",
  "sessions.filterAll": "All states",
  "sessions.filterScopeHint":
    "State filters apply to the sessions already loaded below.",
  "sessions.column.vehicle": "Vehicle",
  "sessions.column.state": "State",
  "sessions.column.created": "Created",
  "sessions.column.updated": "Updated",
  "sessions.column.parkingSpotId": "Parking spot ID",
  "sessions.column.keySlotId": "Key slot ID",
  "sessions.column.assignee": "Assignee membership ID",
  "sessions.empty": "No matching service sessions in the loaded results.",
  "sessions.detail.title": "Service Session Detail",
  "sessions.detail.sessionId": "Session ID",
  "sessions.detail.vehicleId": "Vehicle ID",
  "sessions.detail.plateNumber": "Plate number",
  "sessions.detail.plateCountry": "Plate country",
  "sessions.detail.temporaryDescriptor": "Temporary descriptor",
  "sessions.detail.state": "State",
  "sessions.detail.createdAt": "Created at",
  "sessions.detail.updatedAt": "Updated at",
  "sessions.detail.parkingSpotId": "Parking spot ID",
  "sessions.detail.keySlotId": "Key slot ID",
  "sessions.detail.assigneeMembershipId": "Current assignee membership ID",
  "sessions.fallback.unnamedVehicle": "Unnamed vehicle",
};

export const sessionsAr: SessionsStrings = {
  "page.sessions.title": "السيارات قيد الخدمة",
  "page.sessions.description":
    "كل عملية خدمة حالية ومرجع السيارة وحالتها وموقفها وخانة المفتاح والموظف المُسند عند توفره.",
  "page.sessions.contractNote":
    "يعرض كل عملية خدمة حالية ومرجع السيارة وحالتها وموقفها وخانة المفتاح والموظف المُسند عند توفره. تفاصيل العميل والتسلسل الزمني الكامل للعملية لا يظهران هنا؛ والعمليات المكتملة ليست جزءًا من هذا العرض.",
  "sessions.filterGroup": "تصفية حسب الحالة",
  "sessions.filterAll": "كل الحالات",
  "sessions.filterScopeHint":
    "تُطبَّق تصفية الحالة على العمليات المحمَّلة أدناه فقط.",
  "sessions.column.vehicle": "السيارة",
  "sessions.column.state": "الحالة",
  "sessions.column.created": "أُنشئت",
  "sessions.column.updated": "آخر تحديث",
  "sessions.column.parkingSpotId": "معرّف الموقف",
  "sessions.column.keySlotId": "معرّف خانة المفتاح",
  "sessions.column.assignee": "معرّف الموظف المُسند",
  "sessions.empty": "لا توجد عمليات خدمة مطابقة ضمن النتائج المحمَّلة.",
  "sessions.detail.title": "تفاصيل عملية الخدمة",
  "sessions.detail.sessionId": "معرّف العملية",
  "sessions.detail.vehicleId": "معرّف السيارة",
  "sessions.detail.plateNumber": "رقم اللوحة",
  "sessions.detail.plateCountry": "دولة اللوحة",
  "sessions.detail.temporaryDescriptor": "الوصف المؤقت",
  "sessions.detail.state": "الحالة",
  "sessions.detail.createdAt": "وقت الإنشاء",
  "sessions.detail.updatedAt": "وقت آخر تحديث",
  "sessions.detail.parkingSpotId": "معرّف الموقف",
  "sessions.detail.keySlotId": "معرّف خانة المفتاح",
  "sessions.detail.assigneeMembershipId": "معرّف الموظف المُسند الحالي",
  "sessions.fallback.unnamedVehicle": "سيارة بدون بيانات لوحة",
};
