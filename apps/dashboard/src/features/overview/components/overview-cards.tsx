"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import type { FinancialOverviewCurrencyGroup } from "@valet/contracts";

import { Skeleton } from "../../../components/ui/skeleton";
import { StatusBadge } from "../../../components/ui/status-badge";
import { useTranslation } from "../../../i18n/locale-provider";
import type { TranslationKey } from "../../../i18n/translations/types";

/**
 * Presentational building blocks of the /overview composition. They render
 * authoritative backend values only; all labels resolve through the typed
 * i18n dictionaries at render time.
 */

export function OverviewKpiValue({
  label,
  value,
  sub,
  elevated = false,
}: {
  label: string;
  value: ReactNode;
  sub?: string | undefined;
  elevated?: boolean | undefined;
}) {
  return (
    <div className="overview-kpi-card">
      <p className="overview-kpi-label">{label}</p>
      <p
        className={`overview-kpi-value${elevated ? " is-warning" : ""}`}
      >
        {value}
      </p>
      {sub !== undefined && <p className="overview-kpi-sub">{sub}</p>}
    </div>
  );
}

export function OverviewKpiSkeleton() {
  return (
    <div className="overview-kpi-card" aria-hidden="true">
      <p className="overview-kpi-label">&nbsp;</p>
      <Skeleton lines={1} />
    </div>
  );
}

export function SessionStateCountTile({
  state,
  count,
}: {
  state: string;
  count: number;
}) {
  return (
    <div className="overview-state-tile">
      <StatusBadge variant="session" value={state} />
      <p className="overview-state-count">{count}</p>
    </div>
  );
}

function FinancialFactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="overview-fact-row">
      <span className="overview-fact-label">{label}</span>
      <span className="overview-fact-value">{value}</span>
    </div>
  );
}

/**
 * Per-currency financial snapshot. Money values are the exact decimal strings
 * received from the backend; they are only ever concatenated with their own
 * currency code for display and never combined across currencies.
 */
export function FinancialCurrencyCard({
  group,
}: {
  group: FinancialOverviewCurrencyGroup;
}) {
  const { t } = useTranslation();
  return (
    <section className="card">
      <div className="card-section-header">
        <h2>{`${t("overview.financial.snapshotTitle")} · ${group.currency}`}</h2>
        <Link className="overview-link-action" href="/financial">
          {t("overview.financial.details")}
        </Link>
      </div>
      <div className="overview-fact-list">
        <FinancialFactRow
          label={t("overview.financial.payments")}
          value={String(group.paymentCount)}
        />
        <FinancialFactRow
          label={t("overview.financial.amountDue")}
          value={`${group.currency} ${group.amountDueTotal}`}
        />
        <FinancialFactRow
          label={t("overview.financial.amountPaid")}
          value={`${group.currency} ${group.amountPaidTotal}`}
        />
        <FinancialFactRow
          label={t("overview.financial.tips")}
          value={`${group.currency} ${group.tipAmountTotal}`}
        />
      </div>
    </section>
  );
}

export interface OverviewSectionLink {
  readonly href: string;
  readonly titleKey: TranslationKey;
  readonly descriptionKey: TranslationKey;
}

export function QuickSectionTile({
  href,
  titleKey,
  descriptionKey,
}: OverviewSectionLink) {
  const { t } = useTranslation();
  return (
    <Link className="overview-quick-tile" href={href}>
      <p className="overview-quick-title">{t(titleKey)}</p>
      <p className="overview-quick-description">{t(descriptionKey)}</p>
    </Link>
  );
}
