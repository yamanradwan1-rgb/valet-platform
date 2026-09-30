import type { TranslationKey } from "../../lib/i18n/dictionaries";
import type { DashboardShellLabels } from "../shell";

export function dashboardShellLabels(
  t: (key: TranslationKey) => string,
): DashboardShellLabels {
  return {
    changeScope: t("changeScope"),
    collapseNavigation: t("collapseNavigation"),
    closeNavigation: t("closeNavigation"),
    expandNavigation: t("expandNavigation"),
    location: t("location"),
    navigation: t("navigation"),
    openNavigation: t("openNavigation"),
    organization: t("organization"),
  };
}
