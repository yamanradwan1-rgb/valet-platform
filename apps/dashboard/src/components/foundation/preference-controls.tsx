"use client";

import { Button } from "../presentation/button";
import { Panel } from "../presentation/panel";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { useDashboardTheme } from "../../lib/theme/theme-provider";

export function PreferenceControls() {
  const { locale, setLocale, t } = useDashboardLocale();
  const { theme, setTheme } = useDashboardTheme();

  return (
    <Panel>
      <div className="stack">
        <div>
          <p className="eyebrow">{t("language")}</p>
          <div className="scope-line" role="group" aria-label={t("language")}>
            <Button
              aria-pressed={locale === "en"}
              onClick={() => setLocale("en")}
              variant={locale === "en" ? "primary" : "secondary"}
            >
              {t("english")}
            </Button>
            <Button
              aria-pressed={locale === "ar"}
              onClick={() => setLocale("ar")}
              variant={locale === "ar" ? "primary" : "secondary"}
            >
              {t("arabic")}
            </Button>
          </div>
        </div>
        <div>
          <p className="eyebrow">{t("theme")}</p>
          <div className="scope-line" role="group" aria-label={t("theme")}>
            <Button
              aria-pressed={theme === "light"}
              onClick={() => setTheme("light")}
              variant={theme === "light" ? "primary" : "secondary"}
            >
              {t("light")}
            </Button>
            <Button
              aria-pressed={theme === "dark"}
              onClick={() => setTheme("dark")}
              variant={theme === "dark" ? "primary" : "secondary"}
            >
              {t("dark")}
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}
