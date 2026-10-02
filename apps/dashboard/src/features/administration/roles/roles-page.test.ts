import { staffManagementRoleSchema } from "@valet/contracts";
import { describe, expect, it } from "vitest";

import { fixedRoleReference, roleReferenceCopy } from "./role-reference";

describe("Fixed staff role reference", () => {
  for (const locale of ["en", "ar"] as const) {
    it(`${locale} covers exactly the four canonical roles with read-only localized content`, () => {
      const rows = fixedRoleReference(locale);
      expect(rows.map((row) => row.role)).toEqual(
        staffManagementRoleSchema.options,
      );
      expect(rows).toHaveLength(4);
      for (const row of rows) {
        expect(Object.keys(row).sort()).toEqual([
          "capabilities",
          "conditions",
          "label",
          "role",
          "scope",
        ]);
        for (const field of [
          row.label,
          row.scope,
          row.capabilities,
          row.conditions,
        ]) {
          expect(field.trim().length).toBeGreaterThan(0);
          expect(field).not.toContain("—");
          if (locale === "ar") expect(field).toMatch(/[\u0600-\u06ff]/u);
        }
      }
      expect(Object.keys(roleReferenceCopy(locale)).sort()).toEqual([
        "capabilities",
        "conditions",
        "explanation",
        "scope",
      ]);
    });
  }

  it("distinguishes Management scope from field eligibility rather than inheriting roles", () => {
    const [admin, manager, supervisor, employee] = fixedRoleReference("en");
    // DEC-080 + shift-authorization.ts: Management roles are not field roles.
    expect(admin?.scope).toBe(
      "Organization-wide Management, across its Locations.",
    );
    expect(admin?.conditions).toContain("No field-operation eligibility");
    expect(manager?.conditions).toContain("No field-operation eligibility");
    // DEC-081 T05-B + staff-management-authorization.ts: complete active coverage.
    expect(manager?.scope).toBe("Currently granted active Locations only.");
    expect(manager?.conditions).toContain("non-empty grants fully within");
    expect(manager?.conditions).toContain("Employee ↔ Supervisor only");
    expect(manager?.conditions).toContain(
      "no Admin/Manager creation or elevation",
    );
    // reassign-task-command.ts: supervisor-only, reason and assignee eligibility.
    expect(supervisor?.capabilities).toContain(
      "assign/reassign permitted tasks",
    );
    expect(supervisor?.conditions).toContain("reason and eligible assignee");
    expect(supervisor?.conditions).toContain(
      "No general Management administration",
    );
    // key-session-authorization.ts, complete-handoff-locks.ts, incident-creation-authorization.ts.
    expect(employee?.scope).toContain("active shift for task/key work");
    expect(employee?.conditions).toContain("handoff verification guards");
    expect(employee?.conditions).toContain("No staff/configuration management");
  });

  it("makes the assignment surface and server authority explicit in both languages", () => {
    expect(roleReferenceCopy("en").explanation).toContain("Employees & Shifts");
    expect(roleReferenceCopy("en").explanation).toContain(
      "server enforces permissions",
    );
    expect(roleReferenceCopy("ar").explanation).toContain("الموظفين والورديات");
    expect(roleReferenceCopy("ar").explanation).toContain(
      "يفرض الخادم الصلاحيات",
    );
    const [admin, manager, supervisor, employee] = fixedRoleReference("ar");
    expect(admin?.conditions).toContain("لا يمنح أهلية للعمل الميداني");
    expect(manager?.conditions).toContain("لا يمنح أهلية للعمل الميداني");
    expect(manager?.conditions).toContain("غير فارغة");
    expect(manager?.conditions).toContain("بالكامل");
    expect(supervisor?.conditions).toContain("لا يمنح صلاحيات إدارية عامة");
    expect(employee?.conditions).toContain("لا إدارة للموظفين أو الإعدادات");
  });
});
