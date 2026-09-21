"use client";

import { Moon, Sun } from "lucide-react";

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
  return (
    <div aria-label={t("theme")} className="theme-segmented" role="group">
      <button
        aria-pressed={theme === "light"}
        className="theme-segment"
        onClick={() => setTheme("light")}
        type="button"
      >
        <Sun aria-hidden="true" size={15} />
        <span>{t("light")}</span>
      </button>
      <button
        aria-pressed={theme === "dark"}
        className="theme-segment"
        onClick={() => setTheme("dark")}
        type="button"
      >
        <Moon aria-hidden="true" size={15} />
        <span>{t("dark")}</span>
      </button>
    </div>
  );
}
