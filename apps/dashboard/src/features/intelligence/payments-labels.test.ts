import { describe, expect, it } from "vitest";
import { paymentMethodLabel, paymentStatusLabel } from "./payments-labels";

describe("Payments controlled labels", () => {
  it("humanizes every allowed method in both locales without changing counts", () => {
    const methods = ["NONE", "CASH", "DIGITAL"] as const;
    expect(methods.map((code) => paymentMethodLabel(code, "en"))).toEqual([
      "None",
      "Cash",
      "Digital",
    ]);
    expect(methods.map((code) => paymentMethodLabel(code, "ar"))).toEqual([
      "لا توجد",
      "نقدي",
      "رقمي",
    ]);
  });
  it("humanizes every allowed status in both locales", () => {
    const statuses = [
      "NOT_REQUIRED",
      "UNPAID",
      "PENDING",
      "PAID",
      "FAILED",
    ] as const;
    expect(statuses.map((code) => paymentStatusLabel(code, "en"))).toEqual([
      "Not required",
      "Unpaid",
      "Pending",
      "Paid",
      "Failed",
    ]);
    expect(statuses.map((code) => paymentStatusLabel(code, "ar"))).toEqual([
      "غير مطلوب",
      "غير مسدد",
      "قيد الانتظار",
      "مسدد",
      "فشل",
    ]);
  });
});
