import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { parseOcrControlCommand } from "../tools/ocr-control/input";
import { executeOcrControl } from "../tools/ocr-control/execute";
import type { OcrToolClient } from "../tools/ocr-control/restricted-connection";

const op = randomUUID();
const org = randomUUID();
const period = randomUUID();
const attempt = randomUUID();
const base = ["--operation-id", op, "--reason-code", "QA_CONTAINMENT"];

const commands = [
  [
    "provision-period",
    ...base,
    "--account-alias",
    "qa_account",
    "--starts-at",
    "2026-11-05T00:00:00Z",
    "--ends-at",
    "2026-12-05T00:00:00Z",
    "--quota-units",
    "30",
  ],
  [
    "set-org",
    ...base,
    "--organization-id",
    org,
    "--expected-revision",
    "1",
    "--enabled",
    "false",
    "--concurrency-cap",
    "0",
  ],
  [
    "allocate",
    ...base,
    "--period-id",
    period,
    "--organization-id",
    org,
    "--expected-revision",
    "0",
    "--quota-units",
    "15",
  ],
  [
    "set-platform",
    ...base,
    "--expected-revision",
    "1",
    "--enabled",
    "false",
    "--account-alias",
    "qa_account",
    "--concurrency-cap",
    "0",
  ],
  [
    "activate-period",
    ...base,
    "--period-id",
    period,
    "--expected-revision",
    "2",
  ],
  [
    "resolve-attempt",
    ...base,
    "--attempt-id",
    attempt,
    "--organization-id",
    org,
    "--expected-revision",
    "1",
    "--proof-code",
    "REMOTE_COMPLETED_FENCED",
    "--evidence-ref",
    "QA.PROVIDER.DRAIN:43",
  ],
] as const;

const sqlFunctions = [
  "ocr_operator_provision_period",
  "ocr_operator_set_org",
  "ocr_operator_allocate",
  "ocr_operator_set_platform",
  "ocr_operator_activate_period",
  "ocr_operator_resolve_attempt",
];

function changed(
  command: readonly string[],
  flag: string,
  value: string,
): string[] {
  const args = [...command];
  const index = args.indexOf(flag);
  if (index < 0) throw new Error("Test command flag missing.");
  args[index + 1] = value;
  return args;
}

describe("Issue #429 authenticated operator CLI boundaries", () => {
  it("binds each fixed SQL function and never SQL-interpolates user input", async () => {
    for (const [index, args] of commands.entries()) {
      const input = parseOcrControlCommand(args);
      const query = vi.fn(async () => ({
        rowCount: 1,
        rows: [
          {
            period_id: period,
            revision: "2",
          },
        ],
      }));
      const result = await executeOcrControl(
        { query } as unknown as OcrToolClient,
        input,
      );
      const [sql, values] = query.mock.calls[0]! as unknown as [
        string,
        unknown[],
      ];
      expect(sql).toContain(`public.${sqlFunctions[index]}`);
      expect(sql).not.toContain("QA_CONTAINMENT");
      expect(sql).not.toContain("QA.PROVIDER.DRAIN:43");
      expect(values[0]).toBe(op);
      expect(values).toContain("QA_CONTAINMENT");
      expect(result.action).toBe(args[0]);
      expect(result.operationId).toBe(op);
      expect(query).toHaveBeenCalledOnce();
    }
  });

  it.each(
    [
      [...commands[5]!.filter((value) => value !== "QA.PROVIDER.DRAIN:43"), ""],
      [...commands[5]!.slice(0, -2)],
      [...commands[5]!.slice(0, -1), "unsafe evidence with spaces"],
      [...commands[5]!.slice(0, -1), "a".repeat(129)],
      [...commands[5]!.slice(0, -3), "NOT_A_PROOF", ...commands[5]!.slice(-2)],
    ].map((args) => ({ args })),
  )("requires exact bounded remote proof and evidence", ({ args }) => {
    expect(() => parseOcrControlCommand(args)).toThrow();
  });

  it.each(
    [
      [...commands[1]!, "--operator-ref", "spoof"],
      [...commands[1]!, "--enabled", "true"],
      [...commands[1]!.slice(0, -1), "TRUE"],
      [...commands[2]!.slice(0, -1), "-1"],
      [...commands[2]!.slice(0, -1), "9223372036854775808"],
      [...commands[3]!.slice(0, -1), "-1"],
      [...commands[0]!.slice(0, -1), "3.4"],
      [...commands[0]!, "--unknown", "another"],
      changed(commands[0], "--account-alias", "BAD:ALIAS"),
      changed(commands[1], "--concurrency-cap", "10001"),
      changed(commands[4], "--expected-revision", "0"),
      changed(commands[5], "--evidence-ref", ".not-a-proof-ref"),
      changed(commands[0], "--starts-at", "2026-02-30T00:00:00Z"),
    ].map((args) => ({ args })),
  )("rejects incorrect typed controls before any DB call", ({ args }) => {
    expect(() => parseOcrControlCommand(args)).toThrow();
  });

  it("requires valid half-open UTC period and safe reason", () => {
    const values = [...commands[0]!];
    const end = values.indexOf("--ends-at") + 1;
    values[end] = "2026-10-01T00:00:00Z";
    expect(() => parseOcrControlCommand(values)).toThrow();
    values[end] = "2026-12-05T00:00:00Z";
    values[values.indexOf("--reason-code") + 1] = "raw access token\n";
    expect(() => parseOcrControlCommand(values)).toThrow();
  });
});
