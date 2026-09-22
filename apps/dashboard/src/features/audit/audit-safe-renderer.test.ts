import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  managementAuditDetailSchema,
  managementAuditEventSchema,
} from "@valet/contracts";

import { safeAuditDetailRows } from "./audit-safe-details";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("safe Audit detail renderer", () => {
  it.each([
    [{ kind: "CHECK_IN", fromVersion: 1, customerPresent: true }, ["fromVersion", "customerPresent"]],
    [{ kind: "KEY", fromVersion: 1, toVersion: 2 }, ["fromVersion", "toVersion"]],
    [{ kind: "TASK", fromStatus: "QUEUED", toStatus: "ASSIGNED" }, ["fromStatus", "toStatus"]],
    [{ kind: "SHIFT", status: "ACTIVE" }, ["status"]],
    [{ kind: "SESSION", attempt: 1, terminalized: false }, ["attempt", "terminalized"]],
    [{ kind: "INCIDENT", severity: "HIGH", status: "OPEN" }, ["severity", "status"]],
    [{ kind: "FINANCIAL" }, []],
    [{ kind: "MAP" }, []],
    [{ kind: "CONFIGURATION", operation: "SET", settingKey: "hours" }, ["operation", "settingKey"]],
    [{ kind: "REPORT" }, []],
    [{ kind: "STAFF", locationCount: 2, role: "ORG_ADMIN" }, ["locationCount", "role"]],
    [{ kind: "MANAGEMENT", field: "displayName", operation: "SET" }, ["field", "operation"]],
    [{ kind: "UNKNOWN" }, []],
  ])("admits only explicit fields for %o", (input, keys) => {
    const detail = managementAuditDetailSchema.parse(input);
    expect(safeAuditDetailRows(detail).map(([key]) => key)).toEqual(keys);
  });

  it("rejects malformed/raw metadata instead of rendering it", () => {
    expect(managementAuditEventSchema.safeParse({
      eventId: uuid,
      occurredAt: "2026-09-22T10:00:00.000Z",
      scope: { kind: "ORGANIZATION" },
      actor: { type: "SYSTEM" },
      details: { kind: "FINANCIAL", rawMetadata: { secret: "x" } },
      entity: null,
      eventType: "PAYMENT_INITIALIZED",
    }).success).toBe(false);
  });

  it("renders malicious admitted text as escaped inert text", () => {
    const event = managementAuditEventSchema.parse({
      eventId: uuid,
      occurredAt: "2026-09-22T10:00:00.000Z",
      scope: { kind: "ORGANIZATION" },
      actor: { type: "SYSTEM" },
      details: {
        kind: "CONFIGURATION",
        operation: "SET",
        settingKey: "<img src=x onerror=alert(1)>",
      },
      entity: null,
      eventType: "LOCATION_CONFIGURATION_OVERRIDE_SET",
    });
    const row = safeAuditDetailRows(event.details).find(([key]) => key === "settingKey");
    expect(row?.[1]).toBe("<img src=x onerror=alert(1)>");
    const html = renderToStaticMarkup(createElement("span", null, String(row?.[1])));
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<img src=x");
  });

  it("keeps UNKNOWN event minimal with no fabricated actor", () => {
    const parsed = managementAuditEventSchema.parse({
      eventId: uuid,
      occurredAt: "2026-09-22T10:00:00.000Z",
      scope: { kind: "ORGANIZATION" },
      details: { kind: "UNKNOWN" },
      entity: null,
      eventType: "UNKNOWN",
    });
    expect("actor" in parsed).toBe(false);
    expect(safeAuditDetailRows(parsed.details)).toEqual([]);
  });
});
