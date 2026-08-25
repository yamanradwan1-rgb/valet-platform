"use client";

import { EmptyState } from "./empty-state";
import { PageHeader } from "./page-header";
import { useDashboardLocation } from "../../features/location/location-context";
import { useTranslation } from "../../i18n/locale-provider";
import type { TranslationKey } from "../../i18n/translations/types";

interface FoundationPlaceholderProps {
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
}

/**
 * Shared placeholder for routes whose backend data wiring belongs to a later
 * D2+ task. Renders the accepted D1 page title/description plus an explicit
 * not-yet-wired state; never renders fabricated data.
 */
export function FoundationPlaceholder({
  titleKey,
  descriptionKey,
}: FoundationPlaceholderProps) {
  const { t } = useTranslation();
  const location = useDashboardLocation();
  return (
    <>
      <PageHeader title={t(titleKey)} description={t(descriptionKey)} />
      <p className="foundation-note">{t("placeholder.foundationNote")}</p>
      {location === null && (
        <p className="foundation-note">
          {t("placeholder.locationMissingNote")}
        </p>
      )}
      <EmptyState message={t("placeholder.emptyState")} />
    </>
  );
}
