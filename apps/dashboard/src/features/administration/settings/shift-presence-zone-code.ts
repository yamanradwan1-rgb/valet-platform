/** Non-authoritative editing suggestion. The server alone enforces code uniqueness. */
export function suggestZoneCode(label: string): string {
  const transliteration: Record<string, string> = {
    ا: "A", أ: "A", إ: "E", آ: "A", ب: "B", ت: "T", ث: "TH",
    ج: "J", ح: "H", خ: "KH", د: "D", ذ: "TH", ر: "R", ز: "Z",
    س: "S", ش: "SH", ص: "S", ض: "D", ط: "T", ظ: "Z", ع: "A",
    غ: "GH", ف: "F", ق: "Q", ك: "K", ل: "L", م: "M", ن: "N",
    ه: "H", ة: "A", و: "W", ؤ: "W", ي: "Y", ى: "A", ئ: "Y",
    ء: "", پ: "P", چ: "CH", ڤ: "V", گ: "G",
  };
  const normalized = label.normalize("NFKD").replace(/[\u064b-\u065f\u0670]/g, "");
  const ascii = Array.from(normalized, (char) => transliteration[char] ?? char).join("");
  return (
    ascii
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 64)
  );
}

import type { ZoneDraft } from "./shift-presence-zone-draft";

/** Suggest until the user edits Code; never overwrite a deliberate choice. */
export function editZoneDraft(
  current: ZoneDraft,
  key: keyof ZoneDraft,
  value: string,
  canSuggest: boolean,
): ZoneDraft {
  if (key === "label" && canSuggest) {
    return { ...current, label: value, code: value.trim() ? suggestZoneCode(value) : "" };
  }
  return { ...current, [key]: value };
}
