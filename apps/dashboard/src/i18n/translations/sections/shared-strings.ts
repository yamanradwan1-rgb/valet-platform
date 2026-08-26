/**
 * Cross-page action/state strings and enum value labels. Raw backend codes are never rendered.
 */

export interface SharedStrings {
  "actions.loadMore": string;
  "actions.retry": string;
  "states.loading": string;
  "states.errorGeneric": string;
  "states.networkError": string;
  "states.accessDenied": string;
  "enum.session.CHECKING_IN": string;
  "enum.session.AWAITING_PARKING": string;
  "enum.session.PARKING": string;
  "enum.session.PARKED": string;
  "enum.session.REQUESTED": string;
  "enum.session.RETRIEVING": string;
  "enum.session.READY": string;
  "enum.session.HANDOFF_PENDING": string;
  "enum.session.COMPLETED": string;
  "enum.task.QUEUED": string;
  "enum.task.ASSIGNED": string;
  "enum.task.ACCEPTED": string;
  "enum.task.DECLINED": string;
  "enum.task.REASSIGNED": string;
  "enum.task.IN_PROGRESS": string;
  "enum.task.COMPLETED": string;
  "enum.task.CANCELLED": string;
  "enum.keyCustody.SLOT_ASSIGNED": string;
  "enum.keyCustody.CHECKED_OUT": string;
  "enum.keyCustody.RETURNED_TO_SLOT": string;
  "enum.keyCustody.SLOT_CLEARED": string;
  "enum.keyCustody.RELEASED": string;
  "enum.taskType.PARKING": string;
  "enum.taskType.RETRIEVAL": string;
  "enum.retrieval.OPEN": string;
  "enum.retrieval.ACCEPTED": string;
  "enum.requester.CUSTOMER": string;
  "enum.requester.STAFF": string;
  "enum.incident.OPEN": string;
  "enum.incident.INVESTIGATING": string;
  "enum.incident.RESOLVED": string;
  "enum.incident.CLOSED": string;
  "enum.severity.LOW": string;
  "enum.severity.MEDIUM": string;
  "enum.severity.HIGH": string;
  "enum.severity.CRITICAL": string;
  "enum.payment.NOT_REQUIRED": string;
  "enum.payment.UNPAID": string;
  "enum.payment.PENDING": string;
  "enum.payment.PAID": string;
  "enum.payment.FAILED": string;
  "enum.collection.NONE": string;
  "enum.collection.CASH": string;
  "enum.collection.DIGITAL": string;
  "enum.keySlot.ACTIVE": string;
  "enum.keySlot.INACTIVE": string;
  "enum.freshness.LIVE": string;
  "enum.freshness.STALE": string;
  "common.loadMore": string;
  "common.retry": string;
  "common.loading": string;
  "common.loadingMore": string;
  "common.close": string;
  "errors.requestFailed": string;
  "errors.moreFailed": string;
  "errors.accessDenied": string;
  "errors.sessionExpired": string;
  "errors.rateLimited": string;
  "fallback.unassigned": string;
  "fallback.notAssigned": string;
}

export const sharedEn: SharedStrings = {
  "actions.loadMore": "Load more",
  "actions.retry": "Retry",
  "states.loading": "Loading…",
  "states.errorGeneric": "This data could not be loaded.",
  "states.networkError":
    "Network connection unavailable. Check your connection and try again.",
  "states.accessDenied":
    "Your account does not have access to this location's data.",
  "enum.session.CHECKING_IN": "Checking in",
  "enum.session.AWAITING_PARKING": "Awaiting parking",
  "enum.session.PARKING": "Parking",
  "enum.session.PARKED": "Parked",
  "enum.session.REQUESTED": "Retrieval requested",
  "enum.session.RETRIEVING": "Retrieving vehicle",
  "enum.session.READY": "Ready for pickup",
  "enum.session.HANDOFF_PENDING": "Awaiting handoff",
  "enum.session.COMPLETED": "Completed",
  "enum.task.QUEUED": "Queued",
  "enum.task.ASSIGNED": "Assigned",
  "enum.task.ACCEPTED": "Accepted",
  "enum.task.DECLINED": "Declined",
  "enum.task.REASSIGNED": "Reassigned",
  "enum.task.IN_PROGRESS": "In progress",
  "enum.task.COMPLETED": "Completed",
  "enum.task.CANCELLED": "Cancelled",
  "enum.keyCustody.SLOT_ASSIGNED": "Slot assigned",
  "enum.keyCustody.CHECKED_OUT": "Key checked out",
  "enum.keyCustody.RETURNED_TO_SLOT": "Returned to slot",
  "enum.keyCustody.SLOT_CLEARED": "Slot cleared",
  "enum.keyCustody.RELEASED": "Key released",
  "enum.taskType.PARKING": "Parking task",
  "enum.taskType.RETRIEVAL": "Vehicle retrieval task",
  "enum.retrieval.OPEN": "Open",
  "enum.retrieval.ACCEPTED": "Accepted",
  "enum.requester.CUSTOMER": "Customer",
  "enum.requester.STAFF": "Staff",
  "enum.incident.OPEN": "Open",
  "enum.incident.INVESTIGATING": "Investigating",
  "enum.incident.RESOLVED": "Resolved",
  "enum.incident.CLOSED": "Closed",
  "enum.severity.LOW": "Low",
  "enum.severity.MEDIUM": "Medium",
  "enum.severity.HIGH": "High",
  "enum.severity.CRITICAL": "Critical",
  "enum.payment.NOT_REQUIRED": "Not required",
  "enum.payment.UNPAID": "Unpaid",
  "enum.payment.PENDING": "Pending",
  "enum.payment.PAID": "Paid",
  "enum.payment.FAILED": "Failed",
  "enum.collection.NONE": "None",
  "enum.collection.CASH": "Cash",
  "enum.collection.DIGITAL": "Digital",
  "enum.keySlot.ACTIVE": "Active",
  "enum.keySlot.INACTIVE": "Inactive",
  "enum.freshness.LIVE": "LIVE",
  "enum.freshness.STALE": "STALE",
  "common.loadMore": "Load more",
  "common.retry": "Retry",
  "common.loading": "Loading…",
  "common.loadingMore": "Loading more…",
  "common.close": "Close",
  "errors.requestFailed": "This data could not be loaded. Please try again.",
  "errors.moreFailed": "Additional entries could not be loaded.",
  "errors.accessDenied": "You don't have access to this location's data.",
  "errors.sessionExpired": "Your session has expired. Please sign in again.",
  "errors.rateLimited":
    "Too many requests. Please wait a moment and try again.",
  "fallback.unassigned": "Unassigned",
  "fallback.notAssigned": "Not assigned",
};

export const sharedAr: SharedStrings = {
  "actions.loadMore": "تحميل المزيد",
  "actions.retry": "إعادة المحاولة",
  "states.loading": "جارٍ التحميل…",
  "states.errorGeneric": "تعذر تحميل هذه البيانات.",
  "states.networkError":
    "اتصال الشبكة غير متاح. تحقق من اتصالك وحاول مرة أخرى.",
  "states.accessDenied": "حسابك لا يملك صلاحية الوصول إلى بيانات هذا الموقع.",
  "enum.session.CHECKING_IN": "قيد استلام السيارة",
  "enum.session.AWAITING_PARKING": "بانتظار الركن",
  "enum.session.PARKING": "قيد الركن",
  "enum.session.PARKED": "مركونة",
  "enum.session.REQUESTED": "تم طلب السيارة",
  "enum.session.RETRIEVING": "جارٍ إحضار السيارة",
  "enum.session.READY": "جاهزة للاستلام",
  "enum.session.HANDOFF_PENDING": "بانتظار التسليم",
  "enum.session.COMPLETED": "مكتمل",
  "enum.task.QUEUED": "في الانتظار",
  "enum.task.ASSIGNED": "مُسند",
  "enum.task.ACCEPTED": "مقبول",
  "enum.task.DECLINED": "مرفوض",
  "enum.task.REASSIGNED": "مُعاد إسناده",
  "enum.task.IN_PROGRESS": "قيد التنفيذ",
  "enum.task.COMPLETED": "مكتمل",
  "enum.task.CANCELLED": "ملغي",
  "enum.keyCustody.SLOT_ASSIGNED": "تم تعيين خانة",
  "enum.keyCustody.CHECKED_OUT": "تم سحب المفتاح",
  "enum.keyCustody.RETURNED_TO_SLOT": "أُعيد المفتاح إلى الخانة",
  "enum.keyCustody.SLOT_CLEARED": "تم إفراغ الخانة",
  "enum.keyCustody.RELEASED": "تم إنهاء عهدة المفتاح",
  "enum.taskType.PARKING": "مهمة ركن",
  "enum.taskType.RETRIEVAL": "مهمة إحضار سيارة",
  "enum.retrieval.OPEN": "مفتوح",
  "enum.retrieval.ACCEPTED": "مقبول",
  "enum.requester.CUSTOMER": "العميل",
  "enum.requester.STAFF": "الموظف",
  "enum.incident.OPEN": "مفتوح",
  "enum.incident.INVESTIGATING": "قيد المراجعة",
  "enum.incident.RESOLVED": "تمت المعالجة",
  "enum.incident.CLOSED": "مغلق",
  "enum.severity.LOW": "منخفض",
  "enum.severity.MEDIUM": "متوسط",
  "enum.severity.HIGH": "مرتفع",
  "enum.severity.CRITICAL": "حرج",
  "enum.payment.NOT_REQUIRED": "غير مطلوب",
  "enum.payment.UNPAID": "غير مدفوع",
  "enum.payment.PENDING": "قيد الانتظار",
  "enum.payment.PAID": "مدفوع",
  "enum.payment.FAILED": "فشل",
  "enum.collection.NONE": "بدون تحصيل",
  "enum.collection.CASH": "نقدي",
  "enum.collection.DIGITAL": "إلكتروني",
  "enum.keySlot.ACTIVE": "نشط",
  "enum.keySlot.INACTIVE": "غير نشط",
  "enum.freshness.LIVE": "مباشر",
  "enum.freshness.STALE": "غير حديث",
  "common.loadMore": "تحميل المزيد",
  "common.retry": "إعادة المحاولة",
  "common.loading": "جارٍ التحميل…",
  "common.loadingMore": "جارٍ تحميل المزيد…",
  "common.close": "إغلاق",
  "errors.requestFailed": "تعذر تحميل هذه البيانات. حاول مرة أخرى.",
  "errors.moreFailed": "تعذر تحميل إدخالات إضافية.",
  "errors.accessDenied": "لا تملك صلاحية الوصول إلى بيانات هذا الموقع.",
  "errors.sessionExpired": "انتهت صلاحية جلستك. سجّل الدخول مرة أخرى.",
  "errors.rateLimited": "طلبات كثيرة جدًا. انتظر قليلًا ثم حاول مرة أخرى.",
  "fallback.unassigned": "غير معيَّن",
  "fallback.notAssigned": "لا توجد مهمة",
};
