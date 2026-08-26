"use client";

import { PageHeader } from "../../../components/ui/page-header";
import { useTranslation } from "../../../i18n/locale-provider";
import { ReportsView } from "../../../features/reports/reports-view";

/**
 * D4-002 — Reports on real backend data.
 *
 * Daily / weekly / monthly location reports over
 * GET .../reports/{daily,weekly,monthly} plus backend-produced CSV/PDF
 * artifacts via POST .../exports — all through the shared StaffApiClient
 * with shared-contract response validation and a location+kind+period
 * scoped, race-safe request identity. This frontend never generates report
 * bytes itself.
 */
export default function Page() {
  const { t } = useTranslation();
  return (
    <div className="page-shell">
      <PageHeader
        description={t("page.reports.description")}
        title={t("page.reports.title")}
      />
      <ReportsView />
    </div>
  );
}
