/** Canonical persisted values; labels are presentation-only in either locale. */
export const nativeVehicleColorPresets = [
  { value: "White", en: "White", ar: "أبيض", paint: "#FFFFFF" },
  { value: "Black", en: "Black", ar: "أسود", paint: "#090B10" },
  { value: "Silver", en: "Silver", ar: "فضي", paint: "#C3CCD6" },
  { value: "Gray", en: "Gray", ar: "رمادي", paint: "#636D79" },
  { value: "Blue", en: "Blue", ar: "أزرق", paint: "#255DA6" },
  { value: "Red", en: "Red", ar: "أحمر", paint: "#B82B38" },
  { value: "Brown", en: "Brown", ar: "بني", paint: "#754B3A" },
  { value: "Beige / Gold", en: "Beige / Gold", ar: "بيج / ذهبي", paint: null },
  { value: "Green", en: "Green", ar: "أخضر", paint: "#36704F" },
] as const;

export function findNativeVehicleColorPreset(value: string | null | undefined) {
  // Exact matching avoids rewriting legacy names, casing, or Arabic values.
  return nativeVehicleColorPresets.find((preset) => preset.value === value);
}

export function capNativeCustomColor(value: string): string {
  return Array.from(value).slice(0, 80).join("");
}

export function serializeNativeCustomColor(value: string): string | null {
  const bounded = capNativeCustomColor(value);
  // The shared intake contract rejects strings blank after NFKC normalization.
  return bounded.trim().normalize("NFKC").trim() ? bounded : null;
}
