/**
 * Vehicle retrieval queue surface strings (D2-003).
 */

export interface RetrievalQueueStrings {
  "page.retrievalQueue.title": string;
  "page.retrievalQueue.description": string;
  "page.retrievalQueue.contractNote": string;
  "retrievalQueue.column.requestId": string;
  "retrievalQueue.column.requestedAt": string;
  "retrievalQueue.column.status": string;
  "retrievalQueue.column.requester": string;
  "retrievalQueue.column.sessionId": string;
  "retrievalQueue.column.taskStatus": string;
  "retrievalQueue.column.assignee": string;
  "retrievalQueue.empty": string;
  "retrievalQueue.detail.title": string;
  "retrievalQueue.detail.requestId": string;
  "retrievalQueue.detail.valetSessionId": string;
  "retrievalQueue.detail.requestedAt": string;
  "retrievalQueue.detail.status": string;
  "retrievalQueue.detail.requester": string;
  "retrievalQueue.detail.requesterTypeCode": string;
  "retrievalQueue.detail.taskId": string;
  "retrievalQueue.detail.taskStatus": string;
  "retrievalQueue.detail.assigneeMembershipId": string;
}

export const retrievalQueueEn: RetrievalQueueStrings = {
  "page.retrievalQueue.title": "Vehicle Retrieval Queue",
  "page.retrievalQueue.description": "Current retrieval requests snapshot.",
  "page.retrievalQueue.contractNote":
    "Shows current vehicle retrieval requests, who requested them, the related service session and the current task when one exists. Queue-wide wait information is available in Analytics.",
  "retrievalQueue.column.requestId": "Request ID",
  "retrievalQueue.column.requestedAt": "Requested at",
  "retrievalQueue.column.status": "Status",
  "retrievalQueue.column.requester": "Requester",
  "retrievalQueue.column.sessionId": "Session ID",
  "retrievalQueue.column.taskStatus": "Task status",
  "retrievalQueue.column.assignee": "Assignee membership ID",
  "retrievalQueue.empty": "No active vehicle retrieval requests.",
  "retrievalQueue.detail.title": "Retrieval Request Detail",
  "retrievalQueue.detail.requestId": "Request ID",
  "retrievalQueue.detail.valetSessionId": "Valet session ID",
  "retrievalQueue.detail.requestedAt": "Requested at",
  "retrievalQueue.detail.status": "Status",
  "retrievalQueue.detail.requester": "Requester",
  "retrievalQueue.detail.requesterTypeCode": "Requester type code",
  "retrievalQueue.detail.taskId": "Task ID",
  "retrievalQueue.detail.taskStatus": "Task status",
  "retrievalQueue.detail.assigneeMembershipId":
    "Current assignee membership ID",
};

export const retrievalQueueAr: RetrievalQueueStrings = {
  "page.retrievalQueue.title": "طلبات إحضار السيارات",
  "page.retrievalQueue.description": "لقطة حالية لطلبات الإحضار.",
  "page.retrievalQueue.contractNote":
    "يعرض طلبات إحضار السيارات الحالية ومَن طلبها وعملية الخدمة المرتبطة بها والمهمة الحالية إن وجدت. معلومات الانتظار على مستوى الطابور متاحة في التحليلات.",
  "retrievalQueue.column.requestId": "معرّف الطلب",
  "retrievalQueue.column.requestedAt": "وقت الطلب",
  "retrievalQueue.column.status": "الحالة",
  "retrievalQueue.column.requester": "مقدِّم الطلب",
  "retrievalQueue.column.sessionId": "معرّف العملية",
  "retrievalQueue.column.taskStatus": "حالة المهمة",
  "retrievalQueue.column.assignee": "معرّف الموظف المُسند",
  "retrievalQueue.empty": "لا توجد طلبات إحضار سيارات نشطة.",
  "retrievalQueue.detail.title": "تفاصيل طلب الإحضار",
  "retrievalQueue.detail.requestId": "معرّف الطلب",
  "retrievalQueue.detail.valetSessionId": "معرّف عملية الخدمة",
  "retrievalQueue.detail.requestedAt": "وقت الطلب",
  "retrievalQueue.detail.status": "الحالة",
  "retrievalQueue.detail.requester": "مقدِّم الطلب",
  "retrievalQueue.detail.requesterTypeCode": "رمز نوع مقدِّم الطلب",
  "retrievalQueue.detail.taskId": "معرّف المهمة",
  "retrievalQueue.detail.taskStatus": "حالة المهمة",
  "retrievalQueue.detail.assigneeMembershipId": "معرّف الموظف المُسند الحالي",
};
