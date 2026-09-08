import type { FoundationLocale } from "../foundation/foundation-locale";

export interface NativeParkingStartCopy {
  readonly acceptTask: string;
  readonly acceptedBody: string;
  readonly assignedBody: string;
  readonly back: string;
  readonly backToTasks: string;
  readonly checkState: string;
  readonly claimTask: string;
  readonly conflictBody: string;
  readonly conflictTitle: string;
  readonly loading: string;
  readonly parkingInProgress: string;
  readonly parkingStartedBody: string;
  readonly startParking: string;
  readonly startingParking: string;
  readonly statusAccepted: string;
  readonly statusAssigned: string;
  readonly statusInProgress: string;
  readonly statusQueued: string;
  readonly taskTitle: string;
  readonly unknownBody: string;
  readonly unknownTitle: string;
  readonly unavailableBody: string;
  readonly unavailableTitle: string;
  readonly vehicle: string;
  readonly queuedBody: string;
}

const copy: Record<FoundationLocale, NativeParkingStartCopy> = {
  en: {
    acceptTask: "Accept task",
    acceptedBody: "This Parking Task is accepted and ready to start.",
    assignedBody: "Accept this assigned Parking Task before starting Parking.",
    back: "Back",
    backToTasks: "Back to tasks",
    checkState: "Check server state",
    claimTask: "Claim task",
    conflictBody:
      "The Task or vehicle state changed. Review current server state before continuing.",
    conflictTitle: "Parking work changed",
    loading: "Loading current Parking Task…",
    parkingInProgress: "Parking in progress",
    parkingStartedBody:
      "Parking has started on the server. Drive the vehicle to the parking area.",
    startParking: "Start Parking",
    startingParking: "Starting Parking…",
    statusAccepted: "Accepted",
    statusAssigned: "Assigned",
    statusInProgress: "In progress",
    statusQueued: "Queued",
    taskTitle: "Parking Task",
    unknownBody:
      "The Start Parking result is unknown. Check server state before taking another action.",
    unknownTitle: "Start result unknown",
    unavailableBody: "Current Parking Task state is temporarily unavailable.",
    unavailableTitle: "Unable to load Parking Task",
    vehicle: "Vehicle",
    queuedBody: "Claim and accept this Parking Task before starting Parking.",
  },
  ar: {
    acceptTask: "قبول المهمة",
    acceptedBody: "مهمة الاصطفاف مقبولة وجاهزة للبدء.",
    assignedBody: "اقبل مهمة الاصطفاف المسندة قبل بدء الاصطفاف.",
    back: "رجوع",
    backToTasks: "العودة إلى المهام",
    checkState: "تحقق من حالة الخادم",
    claimTask: "استلام المهمة",
    conflictBody:
      "تغيرت المهمة أو حالة المركبة. راجع حالة الخادم الحالية قبل المتابعة.",
    conflictTitle: "تغيرت مهمة الاصطفاف",
    loading: "جارٍ تحميل مهمة الاصطفاف الحالية…",
    parkingInProgress: "الاصطفاف قيد التنفيذ",
    parkingStartedBody:
      "بدأ الاصطفاف على الخادم. قد المركبة إلى منطقة الاصطفاف.",
    startParking: "بدء الاصطفاف",
    startingParking: "جارٍ بدء الاصطفاف…",
    statusAccepted: "مقبولة",
    statusAssigned: "مسندة",
    statusInProgress: "قيد التنفيذ",
    statusQueued: "في قائمة الانتظار",
    taskTitle: "مهمة الاصطفاف",
    unknownBody:
      "نتيجة بدء الاصطفاف غير معروفة. تحقق من حالة الخادم قبل اتخاذ إجراء آخر.",
    unknownTitle: "نتيجة البدء غير معروفة",
    unavailableBody: "حالة مهمة الاصطفاف الحالية غير متاحة مؤقتًا.",
    unavailableTitle: "تعذر تحميل مهمة الاصطفاف",
    vehicle: "المركبة",
    queuedBody: "استلم مهمة الاصطفاف واقبلها قبل بدء الاصطفاف.",
  },
};

export function getNativeParkingStartCopy(locale: FoundationLocale) {
  return copy[locale];
}
