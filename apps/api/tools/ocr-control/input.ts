import { OcrToolError } from "./restricted-connection";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reason = /^[A-Z][A-Z0-9_]{0,63}$/;
const evidence = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const accountAliasPattern = /^[a-z][a-z0-9_-]{0,63}$/;
const positiveInt64 = /^(0|[1-9][0-9]*)$/;

type Action =
  | "provision-period"
  | "set-org"
  | "allocate"
  | "set-platform"
  | "activate-period"
  | "resolve-attempt";

interface BaseCommand {
  readonly action: Action;
  readonly operationId: string;
  readonly reasonCode: string;
  readonly evidenceRef: string | null;
}

type Versioned = { readonly expectedRevision: string };
type EnabledCapacity = {
  readonly enabled: boolean;
  readonly concurrencyCap: number;
};

export type OcrControlCommand =
  | (BaseCommand & {
      readonly action: "provision-period";
      readonly accountAlias: string;
      readonly startsAt: string;
      readonly endsAt: string;
      readonly quotaUnits: string;
    })
  | (BaseCommand &
      Versioned &
      EnabledCapacity & {
        readonly action: "set-org";
        readonly organizationId: string;
      })
  | (BaseCommand &
      Versioned & {
        readonly action: "allocate";
        readonly periodId: string;
        readonly organizationId: string;
        readonly quotaUnits: string;
      })
  | (BaseCommand &
      Versioned &
      EnabledCapacity & {
        readonly action: "set-platform";
        readonly accountAlias: string;
      })
  | (BaseCommand &
      Versioned & {
        readonly action: "activate-period";
        readonly periodId: string;
      })
  | (BaseCommand &
      Versioned & {
        readonly action: "resolve-attempt";
        readonly attemptId: string;
        readonly organizationId: string;
        readonly proofCode:
          "REMOTE_COMPLETED_FENCED" | "REMOTE_NOT_SENT_FENCED";
        readonly evidenceRef: string;
      });

const shared = ["--operation-id", "--reason-code", "--evidence-ref"];
const allowedByAction: Record<Action, readonly string[]> = {
  "provision-period": [
    "--account-alias",
    "--starts-at",
    "--ends-at",
    "--quota-units",
  ],
  "set-org": [
    "--organization-id",
    "--expected-revision",
    "--enabled",
    "--concurrency-cap",
  ],
  allocate: [
    "--period-id",
    "--organization-id",
    "--expected-revision",
    "--quota-units",
  ],
  "set-platform": [
    "--expected-revision",
    "--account-alias",
    "--enabled",
    "--concurrency-cap",
  ],
  "activate-period": ["--expected-revision", "--period-id"],
  "resolve-attempt": [
    "--attempt-id",
    "--organization-id",
    "--expected-revision",
    "--proof-code",
  ],
};

function invalid(): never {
  throw new OcrToolError("Invalid OCR operator command input.");
}

function boundedUuid(value: string): string {
  if (!uuid.test(value)) invalid();
  return value.toLowerCase();
}

function integer64(value: string): string {
  if (!positiveInt64.test(value) || BigInt(value) > 9223372036854775807n)
    invalid();
  return value;
}

function capacity(value: string): number {
  if (!positiveInt64.test(value)) invalid();
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed > 10000) invalid();
  return parsed;
}

function timestamp(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value))
    invalid();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) invalid();
  const expected = value.replace(
    /(?:\.(\d{1,3}))?Z$/,
    (_, fraction: string | undefined) => `.${(fraction ?? "").padEnd(3, "0")}Z`,
  );
  const normalized = parsed.toISOString();
  if (expected !== normalized) invalid();
  return normalized;
}

export function parseOcrControlCommand(
  args: readonly string[],
): OcrControlCommand {
  const [action, ...rest] = args;
  if (!action || !Object.hasOwn(allowedByAction, action)) invalid();
  const operation = action as Action;
  const allowed = new Set([...shared, ...allowedByAction[operation]]);
  const flags = new Map<string, string>();
  if (rest.length % 2 !== 0) invalid();
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (
      !key ||
      !value ||
      !allowed.has(key) ||
      flags.has(key) ||
      value.startsWith("--")
    )
      invalid();
    flags.set(key, value);
  }
  const required = (key: string): string => flags.get(key) ?? invalid();
  const evidenceRef = flags.get("--evidence-ref") ?? null;
  if (evidenceRef !== null && !evidence.test(evidenceRef)) invalid();
  const reasonCode = required("--reason-code");
  if (!reason.test(reasonCode)) invalid();
  const base = {
    operationId: boundedUuid(required("--operation-id")),
    reasonCode,
    evidenceRef,
  };
  const expectedRevision = (allowZero = true) => {
    const value = integer64(required("--expected-revision"));
    if (!allowZero && value === "0") invalid();
    return value;
  };
  const quotaUnits = () => integer64(required("--quota-units"));
  const organizationId = () => boundedUuid(required("--organization-id"));
  const periodId = () => boundedUuid(required("--period-id"));
  const accountAlias = () => {
    const alias = required("--account-alias");
    if (!accountAliasPattern.test(alias)) invalid();
    return alias;
  };
  const enabledCapacity = () => {
    const selected = required("--enabled");
    if (selected !== "true" && selected !== "false") invalid();
    return {
      enabled: selected === "true",
      concurrencyCap: capacity(required("--concurrency-cap")),
    };
  };
  switch (operation) {
    case "provision-period": {
      const startsAt = timestamp(required("--starts-at"));
      const endsAt = timestamp(required("--ends-at"));
      if (startsAt >= endsAt) invalid();
      return {
        ...base,
        action: operation,
        accountAlias: accountAlias(),
        startsAt,
        endsAt,
        quotaUnits: quotaUnits(),
      };
    }
    case "set-org":
      return {
        ...base,
        action: operation,
        organizationId: organizationId(),
        expectedRevision: expectedRevision(),
        ...enabledCapacity(),
      };
    case "allocate":
      return {
        ...base,
        action: operation,
        periodId: periodId(),
        organizationId: organizationId(),
        expectedRevision: expectedRevision(),
        quotaUnits: quotaUnits(),
      };
    case "set-platform":
      return {
        ...base,
        action: operation,
        expectedRevision: expectedRevision(false),
        accountAlias: accountAlias(),
        ...enabledCapacity(),
      };
    case "activate-period":
      return {
        ...base,
        action: operation,
        expectedRevision: expectedRevision(false),
        periodId: periodId(),
      };
    case "resolve-attempt": {
      const proofCode = required("--proof-code");
      if (
        !["REMOTE_COMPLETED_FENCED", "REMOTE_NOT_SENT_FENCED"].includes(
          proofCode,
        )
      )
        invalid();
      if (evidenceRef === null) invalid();
      return {
        ...base,
        action: operation,
        attemptId: boundedUuid(required("--attempt-id")),
        organizationId: organizationId(),
        expectedRevision: expectedRevision(false),
        proofCode: proofCode as
          "REMOTE_COMPLETED_FENCED" | "REMOTE_NOT_SENT_FENCED",
        evidenceRef,
      };
    }
  }
}
