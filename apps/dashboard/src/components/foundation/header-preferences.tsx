"use client";

import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { useDashboardTheme } from "../../lib/theme/theme-provider";
import { Button } from "../presentation/button";

export function HeaderLocaleControl() {
  const { locale, setLocale, t } = useDashboardLocale();
  const next = locale === "en" ? "ar" : "en";
  return (
    <Button
      aria-label={t("language")}
      onClick={() => setLocale(next)}
      type="button"
      variant="quiet"
    >
      {locale === "en" ? "AR" : "EN"}
    </Button>
  );
}

export function HeaderThemeControl() {
  const { theme, setTheme } = useDashboardTheme();
  const { t } = useDashboardLocale();
  const next = theme === "light" ? "dark" : "light";
  return (
    <Button
      aria-label={t("theme")}
      onClick={() => setTheme(next)}
      type="button"
      variant="quiet"
    >
      {theme === "light" ? "◐" : "◑"}
    </Button>
  );
}
