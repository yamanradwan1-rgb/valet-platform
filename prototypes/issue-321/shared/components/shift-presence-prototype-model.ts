import type { PrototypeLocale } from "../types/variant";
export type Point = { lat: number; lng: number };
export type Zone = Point & { id: string; label: string; code: string; radiusMeters: number; state: "ACTIVE" | "DISABLED"; revision: number };
export type ZoneFields = { label: string; code: string; latitude: string; longitude: string; radiusMeters: string; state: "ACTIVE" | "DISABLED" };
export const blank: ZoneFields = { label: "", code: "", latitude: "", longitude: "", radiusMeters: "100", state: "ACTIVE" };
export const phrase = (locale: PrototypeLocale, en: string, ar: string) => locale === "ar" ? ar : en;
