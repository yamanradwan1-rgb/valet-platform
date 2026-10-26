import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { StaffShiftHistoryDetail } from "@valet/contracts";
import {
  StaffShiftCashFacts,
  formatShiftCashAmount,
} from "./staff-shift-cash-facts";

const item: StaffShiftHistoryDetail = {
  shiftId: "60000000-0000-4000-8000-000000000001",
  membershipId: "60000000-0000-4000-8000-000000000002",
  identity: {
    firstName: "Nadia",
    lastName: "Salem",
    email: "synthetic@example.com",
  },
  currentRole: "VALET_EMPLOYEE",
  location: {
    locationId: "60000000-0000-4000-8000-000000000003",
    name: "Synthetic",
    code: "S",
    timezone: "Asia/Amman",
  },
  status: "ENDED",
  startedAt: "2026-10-01T05:00:00Z",
  endedAt: "2026-10-01T07:00:00Z",
};
describe("#342 read-only persisted cash facts", () => {
  it.each([
    ["99999999999.999", "JOD", false, "99999999999.999"],
    ["2.344", "JOD", true, "+2.344"],
    ["-0.002", "JOD", true, "-0.002"],
    ["0.000", "JOD", true, "0.000"],
    ["12.340", "USD", false, "12.34"],
    ["12.345", "USD", false, "12.345"],
    ["12.000", "JPY", false, "12"],
  ] as const)(
    "preserves %s %s exactly",
    (value, currency, signed, expected) => {
      expect(formatShiftCashAmount(value, currency, signed)).toBe(expected);
    },
  );
  it.each(["en", "ar"] as const)(
    "renders all six facts in %s with truthful declaration and safe reporter fallback",
    (locale) => {
      const html = renderToStaticMarkup(
        <StaffShiftCashFacts
          item={{
            ...item,
            cashReconciliation: {
              state: "REPORTED",
              snapshot: {
                cashExpected: "10.001",
                cashReported: "12.345",
                cashVariance: "2.344",
                currency: "JOD",
                reportedAt: "2026-10-01T07:00:00Z",
                reportedBy: null,
              },
            },
          }}
          locale={locale}
        />,
      );
      expect(html).toContain("10.001");
      expect(html).toContain("12.345");
      expect(html).toContain("+2.344");
      expect(html).toContain("JOD");
      expect(html).toContain(
        locale === "ar"
          ? "هوية الموظف غير متاحة"
          : "Employee identity unavailable",
      );
      expect(html).toContain(
        locale === "ar"
          ? "لا يثبت استلام الإدارة"
          : "does not confirm management receipt",
      );
      expect(html).not.toContain("<button");
      expect(html).not.toContain("<input");
    },
  );
  it.each(["NOT_REPORTED", "PENDING", "UNAVAILABLE"] as const)(
    "does not fabricate zeros in %s",
    (state) => {
      for (const locale of ["en", "ar"] as const) {
        const html = renderToStaticMarkup(
          <StaffShiftCashFacts
            item={{ ...item, cashReconciliation: { state, snapshot: null } }}
            locale={locale}
          />,
        );
        expect(html).not.toContain("0.000");
        expect(html).not.toContain("Reported At");
        expect(html).not.toContain("JOD");
      }
    },
  );
  it("does not imply available financial evidence from an older response", () => {
    expect(
      renderToStaticMarkup(<StaffShiftCashFacts item={item} locale="en" />),
    ).toBe("");
  });
});
