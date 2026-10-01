import type { DashboardLocale } from "../../../lib/i18n/locale";

interface PhysicalResourcesCopy {
  readonly addKeySlot: string;
  readonly addParkingSpot: string;
  readonly addParkingZone: string;
  readonly zonesEmpty: string;
  readonly unknownOutcome: string;
  readonly zoneCodeConflict: string;
  readonly cancel: string;
  readonly code: string;
  readonly create: string;
  readonly creating: string;
  readonly download: string;
  readonly keySlot: string;
  readonly keySlots: string;
  readonly keySlotsEmpty: string;
  readonly label: string;
  readonly legacyUnassigned: string;
  readonly next: string;
  readonly parkingSpot: string;
  readonly parkingSpots: string;
  readonly parkingSpotsEmpty: string;
  readonly parkingZone: string;
  readonly physicalResources: string;
  readonly previous: string;
  readonly print: string;
  readonly resourceLabel: string;
  readonly retryExplicit: string;
  readonly selectZone: string;
  readonly status: string;
  readonly subtitle: string;
  readonly viewLabel: string;
}

const english: PhysicalResourcesCopy = {
  addKeySlot: "Add Key Slot",
  addParkingSpot: "Add Parking Spot",
  addParkingZone: "Add Parking Zone",
  zoneCodeConflict: "Duplicate Zone code. Choose another Code.",
  zonesEmpty: "No Parking Zones configured. Add a Parking Zone to continue.",
  unknownOutcome:
    "The result is uncertain. Review the refreshed zones, then explicitly retry the same draft if needed.",
  cancel: "Cancel",
  code: "Code",
  create: "Create",
  creating: "Creating…",
  download: "Download QR",
  keySlot: "KEY SLOT",
  keySlots: "Key Slots",
  keySlotsEmpty: "No Key Slots configured for this Location.",
  label: "Label",
  legacyUnassigned: "Unassigned",
  next: "Next",
  parkingSpot: "PARKING SPOT",
  parkingSpots: "Parking Spots",
  parkingSpotsEmpty: "No Parking Spots configured for this Location.",
  parkingZone: "Parking Zone",
  physicalResources: "Physical Resources",
  previous: "Previous",
  print: "Print Label",
  resourceLabel: "Physical resource label",
  retryExplicit: "Review the refreshed list, then submit again if needed.",
  selectZone: "Select a Parking Zone",
  status: "Status",
  subtitle:
    "Configure persisted Key Slots and Parking Spots for this Location.",
  viewLabel: "View label",
};

const arabic: PhysicalResourcesCopy = {
  addKeySlot: "إضافة خانة مفتاح",
  addParkingSpot: "إضافة موقف",
  addParkingZone: "إضافة منطقة وقوف",
  zoneCodeConflict: "رمز منطقة الوقوف مستخدم بالفعل. اختر رمزًا آخر.",
  zonesEmpty: "لا توجد مناطق وقوف مهيأة. أضف منطقة وقوف للمتابعة.",
  unknownOutcome:
    "نتيجة الإنشاء غير مؤكدة. راجع المناطق المحدّثة ثم أعد المحاولة يدويًا بنفس البيانات عند الحاجة.",
  cancel: "إلغاء",
  code: "الرمز",
  create: "إنشاء",
  creating: "جارٍ الإنشاء…",
  download: "تنزيل QR",
  keySlot: "KEY SLOT",
  keySlots: "خانات المفاتيح",
  keySlotsEmpty: "لا توجد خانات مفاتيح مهيأة لهذا الموقع.",
  label: "التسمية",
  legacyUnassigned: "غير معيّن",
  next: "التالي",
  parkingSpot: "PARKING SPOT",
  parkingSpots: "مواقف السيارات",
  parkingSpotsEmpty: "لا توجد مواقف مهيأة لهذا الموقع.",
  parkingZone: "منطقة الوقوف",
  physicalResources: "الموارد المادية",
  previous: "السابق",
  print: "طباعة الملصق",
  resourceLabel: "ملصق مورد مادي",
  retryExplicit: "راجع القائمة المحدّثة ثم أعد الإرسال يدويًا عند الحاجة.",
  selectZone: "اختر منطقة وقوف",
  status: "الحالة",
  subtitle: "إعداد خانات المفاتيح ومواقف السيارات المحفوظة لهذا الموقع.",
  viewLabel: "عرض الملصق",
};

export function physicalResourcesCopy(locale: DashboardLocale) {
  return locale === "ar" ? arabic : english;
}
