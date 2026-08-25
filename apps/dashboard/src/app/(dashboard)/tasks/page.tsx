"use client";

import { PageHeader } from "../../../components/ui/page-header";
import { TasksView } from "../../../features/tasks/tasks-view";
import { useTranslation } from "../../../i18n/locale-provider";

export default function Page() {
  const { t } = useTranslation();
  return (
    <div className="page-shell">
      <PageHeader
        title={t("page.tasks.title")}
        description={t("page.tasks.description")}
      />
      <TasksView />
    </div>
  );
}
