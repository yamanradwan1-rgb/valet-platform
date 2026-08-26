import type { BrandingSetting } from "@valet/contracts";

import type { TranslationKey } from "../../i18n/translations/types";

/**
 * Label + display mapping for the Branding surface (D4-004).
 *
 * Raw developer enum values are never rendered. Every setting name and
 * description maps into typed translation keys resolved at render time in
 * the active locale; the functions are typed against the shared contract
 * types so a newly added backend setting breaks compilation until it is
 * given a label.
 */

export function brandingSettingLabelKey(
  setting: BrandingSetting,
): TranslationKey {
  const keys: Record<BrandingSetting, TranslationKey> = {
    brandDisplayName: "branding.setting.brandDisplayName",
    brandPrimaryColor: "branding.setting.brandPrimaryColor",
  };
  return keys[setting];
}

export function brandingSettingDescriptionKey(
  setting: BrandingSetting,
): TranslationKey {
  const keys: Record<BrandingSetting, TranslationKey> = {
    brandDisplayName: "branding.description.brandDisplayName",
    brandPrimaryColor: "branding.description.brandPrimaryColor",
  };
  return keys[setting];
}
