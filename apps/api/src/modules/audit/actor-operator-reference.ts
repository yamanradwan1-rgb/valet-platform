export function assertOpaqueOperatorReference(value: string): void {
  if (
    value.length === 0 ||
    [...value].length > 200 ||
    /[\p{Cc}\s@]/u.test(value)
  ) {
    throw new Error("Audit operator reference is invalid.");
  }
}
