"use client";

import { PageHeader } from "../../../components/ui/page-header";
import { AnalyticsView } from "../../../features/analytics/analytics-view";
import { useTranslation } from "../../../i18n/locale-provider";

/**
 * D4-001 — Analytics on real backend data.
 *
 * Operations / Financial / Incidents tabs over
 * GET .../analytics/{operations,financial,incidents} plus the current
 * GET .../analytics/queue snapshot, all through the shared StaffApiClient
 * with shared-contract response validation and a location+period-scoped,
 * race-safe request identity.
 */
export default function Page() {
  const { t } = useTranslation();
  return (
    <div className="page-shell">
      <PageHeader
        description={t("page.analytics.description")}
        title={t("page.analytics.title")}
      />
      <AnalyticsView />
    </div>
  );
}
