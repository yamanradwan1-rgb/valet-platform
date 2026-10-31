import type { Field, Scalar } from "./catalog";

export function parseField(field: Field, text: string): Scalar | undefined {
  if (field.kind === "boolean")
    return text === "true" ? true : text === "false" ? false : undefined;
  if (field.kind === "select")
    return field.options?.includes(text) ? text : undefined;
  if (field.kind === "money")
    return /^(0|[1-9][0-9]{0,10})(\.[0-9]{1,3})?$/.test(text)
      ? text
      : undefined;
  if (!/^\d+$/.test(text)) return undefined;
  const value = Number(text);
  return Number.isSafeInteger(value) &&
    value >= (field.min ?? 0) &&
    value <= (field.max ?? 2147483647)
    ? value
    : undefined;
}
