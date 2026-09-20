"use client";

import { Panel } from "../presentation/panel";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";

export function HelpFoundation() {
  const { t } = useDashboardLocale();
  return (
    <div className="stack">
      <div>
        <p className="eyebrow">VAYLET</p>
        <h1>{t("helpTitle")}</h1>
      </div>
      <Panel>
        <p>{t("helpBody")}</p>
      </Panel>
    </div>
  );
}
