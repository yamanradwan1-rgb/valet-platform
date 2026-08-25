"use client";

import { PageHeader } from "../../../components/ui/page-header";
import { RetrievalQueueView } from "../../../features/retrieval-queue/retrieval-queue-view";
import { useTranslation } from "../../../i18n/locale-provider";

export default function Page() {
  const { t } = useTranslation();
  return (
    <div className="page-shell">
      <PageHeader
        title={t("page.retrievalQueue.title")}
        description={t("page.retrievalQueue.description")}
      />
      <RetrievalQueueView />
    </div>
  );
}
