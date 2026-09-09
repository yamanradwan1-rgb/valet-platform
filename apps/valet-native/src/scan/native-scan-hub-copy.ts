import type { EmployeeLocale } from "@valet/employee-client";

export interface NativeScanHubCopy {
  readonly keySlot: string;
  readonly keySlotDisabled: string;
  readonly licensePlate: string;
  readonly licensePlateSubtitle: string;
  readonly parkingDisabled: string;
  readonly parkingResume: string;
  readonly parkingSpot: string;
  readonly pickupHandoff: string;
  readonly retrievalDisabled: string;
  readonly retrievalResume: string;
  readonly scan: string;
  readonly subtitle: string;
}

const copy: Record<EmployeeLocale, NativeScanHubCopy> = {
  en: {
    keySlot: "Key slot",
    keySlotDisabled: "Open the vehicle workflow first.",
    licensePlate: "License Plate",
    licensePlateSubtitle: "Check in a new vehicle",
    parkingDisabled: "Open an active parking task first.",
    parkingResume: "Resume active parking",
    parkingSpot: "Parking Spot",
    pickupHandoff: "Pickup Handoff",
    retrievalDisabled: "Open an active retrieval task first.",
    retrievalResume: "Resume active retrieval",
    scan: "Scan",
    subtitle: "Choose how to continue",
  },
  ar: {
    keySlot: "خانة المفتاح",
    keySlotDisabled: "افتح عملية المركبة أولاً.",
    licensePlate: "لوحة المركبة",
    licensePlateSubtitle: "تسجيل مركبة جديدة",
    parkingDisabled: "افتح مهمة إيقاف نشطة أولاً.",
    parkingResume: "استئناف عملية الإيقاف الجارية",
    parkingSpot: "موقع الإيقاف",
    pickupHandoff: "الاستلام والتسليم",
    retrievalDisabled: "افتح مهمة استرجاع نشطة أولاً.",
    retrievalResume: "استئناف عملية الاسترجاع الجارية",
    scan: "مسح",
    subtitle: "اختر كيف تريد المتابعة",
  },
};

export function getNativeScanHubCopy(
  locale: EmployeeLocale,
): NativeScanHubCopy {
  return copy[locale];
}
