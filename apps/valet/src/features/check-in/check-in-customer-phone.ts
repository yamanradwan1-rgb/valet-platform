const jordanPhonePresentationSeparators = /[\s()\p{Pd}]+/gu;
const jordanMobileNationalPattern = /^7[0-9]{8}$/;
const jordanMobileE164Pattern = /^\+9627[0-9]{8}$/;

export function normalizeJordanCustomerPhone(input: string): string {
  const compact = input
    .trim()
    .normalize("NFKC")
    .replace(jordanPhonePresentationSeparators, "");
  if (compact === "" || jordanMobileE164Pattern.test(compact)) return compact;

  const national = compact.startsWith("0") ? compact.slice(1) : compact;
  return jordanMobileNationalPattern.test(national)
    ? `+962${national}`
    : compact;
}
