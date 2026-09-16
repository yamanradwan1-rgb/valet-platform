import { failMfaRecovery, type MfaRecoveryArguments } from "./types";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseMfaRecoveryArguments(
  values: readonly string[],
): MfaRecoveryArguments {
  const parsed = new Map<string, string>();
  const accepted = new Set([
    "--operation",
    "--operation-id",
    "--operator-ref",
    "--user-id",
  ]);
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index];
    const value = values[index + 1];
    if (
      flag === undefined ||
      value === undefined ||
      !accepted.has(flag) ||
      parsed.has(flag) ||
      value.startsWith("--")
    ) {
      failMfaRecovery("Invalid command input.");
    }
    parsed.set(flag, value);
  }
  const required = (flag: string): string =>
    parsed.get(flag) ?? failMfaRecovery("Missing required command option.");
  const operation = required("--operation");
  if (operation !== "recover-totp") {
    failMfaRecovery("Invalid recovery operation.");
  }
  return {
    operation,
    operationId: uuid(required("--operation-id")),
    operatorRef: boundedOperatorRef(required("--operator-ref")),
    userId: uuid(required("--user-id")),
  };
}

function uuid(value: string): string {
  if (!uuidPattern.test(value)) failMfaRecovery("Invalid identifier.");
  return value.toLowerCase();
}

function boundedOperatorRef(value: string): string {
  if (
    value.length === 0 ||
    Array.from(value).length > 200 ||
    /\p{Cc}/u.test(value)
  ) {
    failMfaRecovery("Invalid operator reference.");
  }
  return value;
}
