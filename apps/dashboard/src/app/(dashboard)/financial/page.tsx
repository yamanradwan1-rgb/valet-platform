"use client";

import { PageHeader } from "../../../components/ui/page-header";
import { FinancialOverviewView } from "../../../features/financial-overview/financial-overview-view";
import { useTranslation } from "../../../i18n/locale-provider";

/**
 * D4-001 — Financial Overview on real backend data.
 *
 * GET /v1/staff/dashboard/locations/:locationId/overview/financial via the
 * shared StaffApiClient, validated against the shared contract schema. All
 * facts render per currency group exactly as returned by the backend.
 */
export default function Page() {
  const { t } = useTranslation();
  return (
    <div className="page-shell">
      <PageHeader
        description={t("page.financial.description")}
        title={t("page.financial.title")}
      />
      <FinancialOverviewView />
    </div>
  );
}
