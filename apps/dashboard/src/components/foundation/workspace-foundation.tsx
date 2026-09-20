"use client";

import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { Panel } from "../presentation/panel";

export function WorkspaceFoundation() {
  const { t } = useDashboardLocale();
  return (
    <div className="stack">
      <div>
        <p className="eyebrow">VAYLET</p>
        <h1>{t("workspaceTitle")}</h1>
      </div>
      <Panel>
        <p>{t("workspaceReady")}</p>
      </Panel>
    </div>
  );
}
