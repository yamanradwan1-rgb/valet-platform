import { normalizeJordanCheckInPhone } from "@valet/contracts";

export function normalizeJordanCustomerPhone(input: string): string {
  if (input.trim() === "") return "";
  const normalized = normalizeJordanCheckInPhone(input);
  return normalized.ok ? normalized.phone : input.trim().normalize("NFKC");
}
