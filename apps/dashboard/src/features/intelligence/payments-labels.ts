import type { FinancialOverviewCurrencyGroup } from "@valet/contracts";
import type { DashboardLocale } from "../../lib/i18n/locale";

type Method =
  FinancialOverviewCurrencyGroup["collectionMethodCounts"][number]["method"];
type Status = FinancialOverviewCurrencyGroup["statusCounts"][number]["status"];

const methods = {
  en: { NONE: "None", CASH: "Cash", DIGITAL: "Digital" },
  ar: { NONE: "لا توجد", CASH: "نقدي", DIGITAL: "رقمي" },
} satisfies Record<DashboardLocale, Record<Method, string>>;

const statuses = {
  en: {
    NOT_REQUIRED: "Not required",
    UNPAID: "Unpaid",
    PENDING: "Pending",
    PAID: "Paid",
    FAILED: "Failed",
  },
  ar: {
    NOT_REQUIRED: "غير مطلوب",
    UNPAID: "غير مسدد",
    PENDING: "قيد الانتظار",
    PAID: "مسدد",
    FAILED: "فشل",
  },
} satisfies Record<DashboardLocale, Record<Status, string>>;

export function paymentMethodLabel(
  method: Method,
  locale: DashboardLocale,
): string {
  return methods[locale][method];
}

export function paymentStatusLabel(
  status: Status,
  locale: DashboardLocale,
): string {
  return statuses[locale][status];
}
