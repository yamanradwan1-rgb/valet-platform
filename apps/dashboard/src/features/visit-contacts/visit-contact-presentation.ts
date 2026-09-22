export type VisitContactPhone =
  | { readonly kind: "FULL"; readonly value: string }
  | { readonly kind: "MASKED"; readonly ending: string };

export function visitContactPhoneText(
  phone: VisitContactPhone,
  maskedPrefix: string,
): string {
  return phone.kind === "FULL"
    ? phone.value
    : `${maskedPrefix} ${phone.ending}`;
}
