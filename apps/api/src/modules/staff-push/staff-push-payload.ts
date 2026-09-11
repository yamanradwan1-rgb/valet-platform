import type { StaffPushProviderMessage } from "./staff-push-provider";

const bodies = {
  ar: "مهمة استرجاع جديدة متاحة",
  en: "New retrieval task available",
} as const;

function hasExactKeys(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    Object.keys(value).sort().join("\u0000") === [...keys].sort().join("\u0000")
  );
}

export function isValidRetrievalAttentionMessage(
  value: unknown,
): value is StaffPushProviderMessage {
  if (!hasExactKeys(value, ["android", "data", "notification", "token"])) {
    return false;
  }
  if (
    typeof value.token !== "string" ||
    value.token.length === 0 ||
    value.token.length > 4_096 ||
    value.token.trim().length === 0
  ) {
    return false;
  }
  if (!hasExactKeys(value.android, ["priority", "ttl"])) return false;
  const ttl = value.android.ttl;
  if (
    value.android.priority !== "HIGH" ||
    typeof ttl !== "string" ||
    ttl.length > 20 ||
    !/^\d+\.\d{3}s$/.test(ttl) ||
    Number(ttl.slice(0, -1)) <= 0
  ) {
    return false;
  }
  if (
    !hasExactKeys(value.data, [
      "intentId",
      "kind",
      "routeIntent",
      "schemaVersion",
    ]) ||
    typeof value.data.intentId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.data.intentId,
    ) ||
    value.data.kind !== "EMPLOYEE_RETRIEVAL_REQUESTED" ||
    value.data.routeIntent !== "TASK_QUEUE" ||
    value.data.schemaVersion !== "1"
  ) {
    return false;
  }
  if (!hasExactKeys(value.notification, ["body", "title"])) return false;
  return (
    value.notification.title === "VAYLET" &&
    (value.notification.body === bodies.en ||
      value.notification.body === bodies.ar)
  );
}

function remainingTtl(
  remainingLifetimeMilliseconds: number,
): string | undefined {
  const remainingMilliseconds = Math.floor(remainingLifetimeMilliseconds);
  if (remainingMilliseconds <= 0) return undefined;
  const seconds = Math.floor(remainingMilliseconds / 1_000);
  const milliseconds = remainingMilliseconds % 1_000;
  return `${seconds}.${milliseconds.toString().padStart(3, "0")}s`;
}

export function buildRetrievalAttentionMessage(input: {
  readonly intentId: string;
  readonly locale: string;
  readonly providerToken: string;
  readonly remainingLifetimeMilliseconds: number;
}): StaffPushProviderMessage | undefined {
  const ttl = remainingTtl(input.remainingLifetimeMilliseconds);
  if (ttl === undefined) return undefined;
  const locale = input.locale === "ar" ? "ar" : "en";
  return {
    android: { priority: "HIGH", ttl },
    data: {
      intentId: input.intentId,
      kind: "EMPLOYEE_RETRIEVAL_REQUESTED",
      routeIntent: "TASK_QUEUE",
      schemaVersion: "1",
    },
    notification: { body: bodies[locale], title: "VAYLET" },
    token: input.providerToken,
  };
}
