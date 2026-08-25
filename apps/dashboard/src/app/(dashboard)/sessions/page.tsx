"use client";

import { PageHeader } from "../../../components/ui/page-header";
import { SessionsView } from "../../../features/sessions/sessions-view";
import { useTranslation } from "../../../i18n/locale-provider";

export default function Page() {
  const { t } = useTranslation();
  return (
    <div className="page-shell">
      <PageHeader
        title={t("page.sessions.title")}
        description={t("page.sessions.description")}
      />
      <SessionsView />
    </div>
  );
}
