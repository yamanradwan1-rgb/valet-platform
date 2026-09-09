import type { FoundationLocale } from "../foundation/foundation-locale";

const copy = {
  en: {
    destination: "Destination",
    elapsed: "Elapsed",
    key: "Key",
    parkVehicle: "Park Vehicle",
    parking: "Parking",
    parkingArea: "Parking area",
    vehicle: "Vehicle",
    zone: "Zone",
  },
  ar: {
    destination: "الوجهة",
    elapsed: "الوقت المنقضي",
    key: "المفتاح",
    parkVehicle: "اركن المركبة",
    parking: "الركن",
    parkingArea: "منطقة الإيقاف",
    vehicle: "المركبة",
    zone: "المنطقة",
  },
} as const;

export function getNativeActiveParkingCopy(locale: FoundationLocale) {
  return copy[locale];
}
