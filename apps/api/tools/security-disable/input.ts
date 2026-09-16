import {
  failSecurityDisable,
  type SecurityDisableArguments,
} from "./types";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseSecurityDisableArguments(
  values: readonly string[],
): SecurityDisableArguments {
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
      failSecurityDisable("Invalid command input.");
    }
    parsed.set(flag, value);
  }
  const required = (flag: string): string =>
    parsed.get(flag) ?? failSecurityDisable("Missing required command option.");
  const operation = required("--operation");
  if (operation !== "disable-user") {
    failSecurityDisable("Invalid security-disable operation.");
  }
  return {
    operation,
    operationId: uuid(required("--operation-id")),
    operatorRef: operatorRef(required("--operator-ref")),
    userId: uuid(required("--user-id")),
  };
}

function uuid(value: string): string {
  if (!uuidPattern.test(value)) failSecurityDisable("Invalid identifier.");
  return value.toLowerCase();
}

function operatorRef(value: string): string {
  if (
    value.length === 0 ||
    Array.from(value).length > 200 ||
    /\p{Cc}/u.test(value)
  ) {
    failSecurityDisable("Invalid operator reference.");
  }
  return value;
}
