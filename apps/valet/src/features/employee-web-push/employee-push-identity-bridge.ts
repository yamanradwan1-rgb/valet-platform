const taskIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const identities = new Set<string>();
const listeners = new Set<(identity: string) => void>();
const MESSAGE_KEYS = ["identity", "route", "type"];

function hasExactKeys(candidate: Record<string, unknown>): boolean {
  const keys = Object.keys(candidate).sort();
  return (
    keys.length === MESSAGE_KEYS.length &&
    MESSAGE_KEYS.every((key, index) => keys[index] === key)
  );
}

export function clearEmployeePushIdentities(): void {
  identities.clear();
}

export function subscribeEmployeePushIdentity(
  listener: (identity: string) => void,
): () => void {
  listeners.add(listener);
  for (const identity of identities) listener(identity);
  return () => listeners.delete(listener);
}

export function handleEmployeePushClientMessage(
  candidate: unknown,
  onTasks?: (identity: string) => void,
): boolean {
  if (typeof candidate !== "object" || candidate === null) return false;
  const message = candidate as Record<string, unknown>;
  if (
    !hasExactKeys(message) ||
    message.route !== "TASKS" ||
    typeof message.identity !== "string" ||
    !taskIdPattern.test(message.identity) ||
    (message.type !== "VAYLET_EMPLOYEE_PUSH_OBSERVED" &&
      message.type !== "VAYLET_EMPLOYEE_NOTIFICATION_CLICK")
  ) {
    return false;
  }
  identities.add(message.identity);
  for (const listener of listeners) listener(message.identity);
  if (message.type === "VAYLET_EMPLOYEE_NOTIFICATION_CLICK") {
    onTasks?.(message.identity);
  }
  return true;
}
