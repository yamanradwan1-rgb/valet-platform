import { describe, expect, it } from "vitest";
import type { ManagementAuditEvent } from "@valet/contracts";
import { auditDetailValue } from "./audit-detail-values";
import { auditEventLabel } from "./audit-event-copy";
import { safeAuditDetailRows } from "./audit-safe-details";

type AuditDetail = ManagementAuditEvent["details"];
const eventType = "MANAGEMENT_ALERT_TIMING_PREFERENCES_CHANGED";
const detail = {
  kind: "MANAGEMENT",
  changedKeys: ["alt01GraceSeconds", "alt11UnknownPaymentSeconds"],
  beforeRevision: 2,
  afterRevision: 3,
  // The raw audit record must never reveal preference values in this projection.
  beforeValues: { alt01GraceSeconds: 30 },
  afterValues: { alt01GraceSeconds: 60 },
  secret: "DO_NOT_SHOW",
} as unknown as AuditDetail;

describe("Issue 414 safe management audit projection", () => {
  it("uses localized event labels without a new entity or detail kind", () => {
    expect(auditEventLabel(eventType, "en")).toBe("Personal alert timing changed");
    expect(auditEventLabel(eventType, "ar")).toBe("تغيير توقيت التنبيهات الشخصية");
  });

  it("shows only approved changed field names and numeric revisions", () => {
    expect(safeAuditDetailRows(detail, eventType)).toEqual([
      ["changedKeys", "alt01GraceSeconds, alt11UnknownPaymentSeconds"],
      ["beforeRevision", 2],
      ["afterRevision", 3],
    ]);
    expect(safeAuditDetailRows(detail, "MANAGEMENT_COMPANY_SETTING_DEFAULT_CHANGED"))
      .toEqual([]);
    const rows = safeAuditDetailRows(detail, eventType);
    const rendered = JSON.stringify(rows);
    expect(rendered).not.toContain("beforeValues");
    expect(rendered).not.toContain("afterValues");
    expect(rendered).not.toContain("DO_NOT_SHOW");
  });

  it("localizes safe changed-key names without exposing raw values", () => {
    const changedKeys = safeAuditDetailRows(detail, eventType)[0]?.[1];
    expect(changedKeys).toBeTypeOf("string");
    expect(auditDetailValue("MANAGEMENT", "changedKeys", changedKeys!, "en"))
      .toBe("After retrieval SLA breach, Unknown payment outcome (later phase)");
    expect(auditDetailValue("MANAGEMENT", "changedKeys", changedKeys!, "ar"))
      .toBe("بعد تجاوز SLA الاسترجاع, نتيجة الدفع غير المؤكدة (مرحلة لاحقة)");
  });

  it("fails closed for malicious keys or unsafe revision metadata", () => {
    const bad = {
      kind: "MANAGEMENT",
      changedKeys: ["alt01GraceSeconds", "secretUserPassword"],
      beforeRevision: 2,
      afterRevision: 3,
    } as unknown as AuditDetail;
    expect(safeAuditDetailRows(bad, eventType)).toEqual([]);
    expect(safeAuditDetailRows({
      ...bad,
      changedKeys: ["alt01GraceSeconds"],
      beforeRevision: 4,
      afterRevision: 3,
    } as unknown as AuditDetail, eventType)).toEqual([]);
    expect(safeAuditDetailRows({
      ...bad,
      changedKeys: ["alt01GraceSeconds"],
      beforeRevision: 2.5,
      afterRevision: 3,
    } as unknown as AuditDetail, eventType)).toEqual([]);
  });
});
