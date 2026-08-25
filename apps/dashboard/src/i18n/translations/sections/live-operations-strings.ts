/**
 * Live Operations surface strings (D3-001).
 *
 * Page title/description and map loading/failure strings intentionally reuse
 * the existing foundation keys ("page.liveOperations.*", "map.*") — this
 * fragment only adds keys unique to the live operations integration.
 */

export interface LiveOperationsStrings {
  "liveOperations.privacyNote": string;
  "liveOperations.kpi.trackedTasks": string;
  "liveOperations.kpi.positionedVehicles": string;
  "liveOperations.kpi.livePositions": string;
  "liveOperations.kpi.stalePositions": string;
  "liveOperations.map.title": string;
  "liveOperations.map.emptyNoPositions": string;
  "liveOperations.list.empty": string;
  "liveOperations.item.freshness": string;
  "liveOperations.item.noPosition": string;
  "liveOperations.item.capturedAt": string;
  "liveOperations.item.latitude": string;
  "liveOperations.item.longitude": string;
  "liveOperations.item.areas": string;
  "liveOperations.item.assigneeMembershipId": string;
  "liveOperations.item.trackingSessionId": string;
  "liveOperations.item.valetSessionId": string;
  "liveOperations.item.vehicleId": string;
  "liveOperations.vehicle.fallbackName": string;
  "liveOperations.observedAt": string;
  "liveOperations.action.refresh": string;
  "liveOperations.action.refreshing": string;
  "liveOperations.error.refreshFailed": string;
}

export const liveOperationsEn: LiveOperationsStrings = {
  "liveOperations.privacyNote":
    "Live location appears only during active Parking or Vehicle Retrieval tasks. LIVE positions are recent; STALE positions may be outdated and are kept visible as last-known context. Exact coordinates are visible only to authorized staff. Counts cover the tasks currently listed here, not a location-wide total; use “Load more” to retrieve further tracked tasks.",
  "liveOperations.kpi.trackedTasks": "Tracked tasks loaded",
  "liveOperations.kpi.positionedVehicles": "Positions among loaded",
  "liveOperations.kpi.livePositions": "Live among loaded",
  "liveOperations.kpi.stalePositions": "Stale among loaded",
  "liveOperations.map.title": "Live map preview",
  "liveOperations.map.emptyNoPositions":
    "Tracked tasks have no current backend position yet. Vehicles appear here as soon as their trackers report a location.",
  "liveOperations.list.empty":
    "No vehicles are currently tracked. Positions appear during active parking or retrieval tasks.",
  "liveOperations.item.freshness": "Freshness",
  "liveOperations.item.noPosition": "No current position",
  "liveOperations.item.capturedAt": "Captured at",
  "liveOperations.item.latitude": "Latitude",
  "liveOperations.item.longitude": "Longitude",
  "liveOperations.item.areas": "Area",
  "liveOperations.item.assigneeMembershipId": "Assignee membership ID",
  "liveOperations.item.trackingSessionId": "Tracking session ID",
  "liveOperations.item.valetSessionId": "Valet session ID",
  "liveOperations.item.vehicleId": "Vehicle ID",
  "liveOperations.vehicle.fallbackName": "Vehicle",
  // The backend stamps every request with a fresh transaction time and the
  // pagination cursor freezes no snapshot: this label must therefore read as
  // the observation time of the most recent successful server read.
  "liveOperations.observedAt": "Observed at (latest server read)",
  "liveOperations.action.refresh": "Refresh",
  "liveOperations.action.refreshing": "Refreshing…",
  "liveOperations.error.refreshFailed":
    "The latest snapshot could not be loaded. The currently displayed data was kept.",
};

export const liveOperationsAr: LiveOperationsStrings = {
  "liveOperations.privacyNote":
    "تظهر الموقع المباشر فقط أثناء مهام الركن أو إحضار السيارة النشطة. المواقع «المباشرة» حديثة، بينما قد تكون المواقع «غير الحديثة» قديمة وتظل مرئية كسياق لآخر موقع معروف. الإحداثيات الدقيقة متاحة للموظفين المصرَّح لهم فقط. تغطي الأعداد المهام المعروضة هنا فقط وليس إجماليًا على مستوى الموقع؛ استخدم «تحميل المزيد» لجلب مهام متتبعة إضافية.",
  "liveOperations.kpi.trackedTasks": "المهام المتتبعة المُحمَّلة",
  "liveOperations.kpi.positionedVehicles": "المواقع ضمن المُحمَّل",
  "liveOperations.kpi.livePositions": "مباشر ضمن المُحمَّل",
  "liveOperations.kpi.stalePositions": "غير حديث ضمن المُحمَّل",
  "liveOperations.map.title": "معاينة الخريطة المباشرة",
  "liveOperations.map.emptyNoPositions":
    "لا تملك المهام المتتبعة موقعًا حاليًا من الخادم بعد. ستظهر السيارات هنا بمجرد أن يرسل متتبعوها موقعًا.",
  "liveOperations.list.empty":
    "لا توجد سيارات متتبعة حاليًا. تظهر المواقع أثناء مهام الركن أو الإحضار النشطة.",
  "liveOperations.item.freshness": "حداثة الموقع",
  "liveOperations.item.noPosition": "لا يوجد موقع حالي",
  "liveOperations.item.capturedAt": "وقت الالتقاط",
  "liveOperations.item.latitude": "خط العرض",
  "liveOperations.item.longitude": "خط الطول",
  "liveOperations.item.areas": "المنطقة",
  "liveOperations.item.assigneeMembershipId": "معرّف الموظف المُسند",
  "liveOperations.item.trackingSessionId": "معرّف جلسة التتبع",
  "liveOperations.item.valetSessionId": "معرّف عملية الخدمة",
  "liveOperations.item.vehicleId": "معرّف السيارة",
  "liveOperations.vehicle.fallbackName": "سيارة",
  "liveOperations.observedAt": "وقت الرصد (أحدث قراءة من الخادم)",
  "liveOperations.action.refresh": "تحديث",
  "liveOperations.action.refreshing": "جارٍ التحديث…",
  "liveOperations.error.refreshFailed":
    "تعذر تحميل أحدث لقطة. تم الاحتفاظ بالبيانات المعروضة حاليًا.",
};
