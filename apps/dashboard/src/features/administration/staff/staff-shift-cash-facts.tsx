import type { ReactNode } from "react";
import type { StaffShiftHistoryDetail } from "@valet/contracts";
import type { DashboardLocale } from "../../../lib/i18n/locale";
import { styles } from "../administration-ui";
import { formatStaffTime } from "./staff-presentation";

/** Decimal string presentation only: never convert persisted money to a JS number. */
export function formatShiftCashAmount(
  value: string,
  currency: string,
  signed = false,
) {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return value;
  const [, minus, integer, fraction = ""] = match;
  let digits = fraction.length;
  try {
    digits =
      new Intl.NumberFormat("en", {
        style: "currency",
        currency,
      }).resolvedOptions().maximumFractionDigits ?? digits;
  } catch {
    /* Retain exact persisted precision for an unknown currency. */
  }
  // Extra significant precision is retained rather than rounded or hidden.
  const precision = /[1-9]/.test(fraction.slice(digits))
    ? fraction.length
    : digits;
  const decimal = fraction.slice(0, precision).padEnd(precision, "0");
  const positive = signed && !minus && /[1-9]/.test(`${integer}${fraction}`);
  return `${positive ? "+" : minus}${integer}${precision ? `.${decimal}` : ""}`;
}

export function StaffShiftCashFacts({
  item,
  locale,
}: {
  readonly item: StaffShiftHistoryDetail;
  readonly locale: DashboardLocale;
}) {
  const evidence = item.cashReconciliation;
  // Compatibility with pre-feature servers; absence never becomes a zero report.
  if (!evidence) return null;
  const ar = locale === "ar";
  const labels = ar
    ? [
        "تسوية النقد",
        "النقد المتوقع",
        "النقد المصرّح به",
        "فرق النقد",
        "العملة",
        "وقت الإقرار",
        "صرّح به",
      ]
    : [
        "Cash Reconciliation",
        "Cash Expected",
        "Cash Reported",
        "Cash Variance",
        "Currency",
        "Reported At",
        "Reported By",
      ];
  const cash = evidence.snapshot;
  return (
    <section aria-label={labels[0]} className={styles.stack}>
      <h3 className={styles.sectionTitle}>{labels[0]}</h3>
      {cash ? (
        <>
          <CashFact label={labels[1]!}>
            <bdi dir="ltr">
              {formatShiftCashAmount(cash.cashExpected, cash.currency)}
            </bdi>
          </CashFact>
          <CashFact label={labels[2]!}>
            <bdi dir="ltr">
              {formatShiftCashAmount(cash.cashReported, cash.currency)}
            </bdi>
          </CashFact>
          <CashFact label={labels[3]!}>
            <bdi dir="ltr">
              {formatShiftCashAmount(cash.cashVariance, cash.currency, true)}
            </bdi>
          </CashFact>
          <CashFact label={labels[4]!}>
            <bdi dir="ltr">{cash.currency}</bdi>
          </CashFact>
          <CashFact label={labels[5]!}>
            <bdi dir="auto">
              {formatStaffTime(cash.reportedAt, item.location.timezone, locale)}
            </bdi>
          </CashFact>
          <CashFact label={labels[6]!}>
            <bdi dir="auto">
              {cash.reportedBy ??
                (ar
                  ? "هوية الموظف غير متاحة"
                  : "Employee identity unavailable")}
            </bdi>
          </CashFact>
          <p className={styles.muted}>
            {ar
              ? "النقد المصرّح به هو إقرار الموظف بالنقد الفعلي، ولا يثبت استلام الإدارة أو الإيداع أو التسوية."
              : "Cash Reported is the employee's physical cash declaration; it does not confirm management receipt, deposit, or settlement."}
          </p>
        </>
      ) : (
        <p className={styles.muted}>
          {evidence.state === "PENDING"
            ? ar
              ? "إقرار النقد قيد الانتظار"
              : "Cash declaration pending"
            : evidence.state === "UNAVAILABLE"
              ? ar
                ? "تسوية النقد غير متاحة"
                : "Cash reconciliation unavailable"
              : ar
                ? "غير مسجّل"
                : "Not reported"}
        </p>
      )}
    </section>
  );
}

function CashFact({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div>
      <div className={styles.muted}>{label}</div>
      <div className={styles.strong}>{children}</div>
    </div>
  );
}
