/**
 * Key custody board surface strings (D2-004).
 */

export interface KeysStrings {
  "page.keys.title": string;
  "page.keys.description": string;
  "page.keys.empty": string;
  "page.keys.kpiSlots": string;
  "page.keys.kpiActiveSlots": string;
  "page.keys.kpiHoldingSession": string;
  "page.keys.scopeNote": string;
  "page.keys.holdingSessionIdLabel": string;
  "page.keys.noHoldingSession": string;
  "page.keys.detailTitle": string;
  "page.keys.field.keySlotId": string;
  "page.keys.field.code": string;
  "page.keys.field.status": string;
}

export const keysEn: KeysStrings = {
  "page.keys.title": "Key Custody Board",
  "page.keys.description": "Key-slot status and linked service sessions.",
  "page.keys.empty": "No key slots are configured for this location yet.",
  "page.keys.kpiSlots": "Key slots loaded",
  "page.keys.kpiActiveSlots": "Active among loaded",
  "page.keys.kpiHoldingSession": "Holding a session (loaded)",
  "page.keys.scopeNote":
    "Shows each key slot's current status and the service session currently linked to it. Custody history is kept separately and is never guessed from this snapshot.",
  "page.keys.holdingSessionIdLabel": "Holding session ID",
  "page.keys.noHoldingSession": "No holding session",
  "page.keys.detailTitle": "Key slot detail",
  "page.keys.field.keySlotId": "Key slot ID",
  "page.keys.field.code": "Code",
  "page.keys.field.status": "Status",
};

export const keysAr: KeysStrings = {
  "page.keys.title": "لوحة عهدة المفاتيح",
  "page.keys.description": "حالة خانات المفاتيح وعمليات الخدمة المرتبطة بها.",
  "page.keys.empty": "لم يتم إعداد خانات مفاتيح لهذا الموقع بعد.",
  "page.keys.kpiSlots": "خانات المفاتيح المحمّلة",
  "page.keys.kpiActiveSlots": "نشطة ضمن المحمّلة",
  "page.keys.kpiHoldingSession": "تحمل عملية خدمة ضمن المحمّل",
  "page.keys.scopeNote":
    "تعرض حالة كل خانة مفتاح وعملية الخدمة المرتبطة بها حاليًا. يُحفظ سجل العهدة في مكان منفصل ولا يُستنتج أبدًا من هذه اللقطة.",
  "page.keys.holdingSessionIdLabel": "معرّف عملية الخدمة الحاملة",
  "page.keys.noHoldingSession": "لا توجد عملية خدمة حاملة",
  "page.keys.detailTitle": "تفاصيل خانة المفتاح",
  "page.keys.field.keySlotId": "معرّف خانة المفتاح",
  "page.keys.field.code": "الرمز",
  "page.keys.field.status": "الحالة",
};
