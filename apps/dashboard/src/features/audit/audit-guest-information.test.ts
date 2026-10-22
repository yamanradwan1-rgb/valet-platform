import { describe, expect, it } from "vitest";
import { auditDetailKindLabel, auditDetailValue } from "./audit-detail-values";
import { auditEventLabel } from "./audit-event-copy";
import { safeAuditDetailRows } from "./audit-safe-details";

describe("Guest information audit presentation", () => {
  it("provides localized event, kind and operation labels", () => {
    expect(auditEventLabel("MANAGEMENT_GUEST_INFORMATION_CHANGED", "en"))
      .toBe("Guest information changed");
    expect(auditEventLabel("MANAGEMENT_GUEST_INFORMATION_CHANGED", "ar"))
      .toBe("تغيير معلومات الضيف");
    expect(auditDetailKindLabel("GUEST_INFORMATION", "en"))
      .toBe("Guest information");
    expect(auditDetailValue("GUEST_INFORMATION", "operation", "PRIVACY_PUBLISHED", "ar"))
      .toBe("نشر الخصوصية");
  });

  it("renders only an audited operation, with no policy or contact content", () => {
    expect(safeAuditDetailRows({
      kind: "GUEST_INFORMATION", operation: "CONTACT_LOCATION_OVERRIDE_SAVED",
    })).toEqual([["operation", "CONTACT_LOCATION_OVERRIDE_SAVED"]]);
  });
});
