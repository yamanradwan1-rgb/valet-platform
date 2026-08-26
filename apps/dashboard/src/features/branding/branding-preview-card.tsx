"use client";

import type { BrandingReadResponse } from "@valet/contracts";

import { useTranslation } from "../../i18n/locale-provider";
import { COLOR_INPUT_PATTERN } from "./branding-state";

/**
 * SCOPED preview of the backend-provided effective branding (D4-004).
 *
 * It reads ONLY the authoritative effective values of the CURRENT location
 * envelope and renders a local preview card. It NEVER mutates global
 * dashboard CSS/theme, never writes CSS variables on documentElement, and is
 * keyed by location at the surface level — so A's branding can never leak
 * into B after a location switch.
 *
 * Decorative color surfaces are aria-hidden; the exact values (display name,
 * hex string) are always present as real text.
 */
export function BrandingPreviewCard({ data }: { data: BrandingReadResponse }) {
  const { t } = useTranslation();
  const name = data.displayName.effective;
  const color = data.primaryColor.effective;
  // First grapheme/code point of the applied display name for the avatar.
  const initial = Array.from(name)[0] ?? "•";
  const safeColor = COLOR_INPUT_PATTERN.test(color) ? color : "transparent";

  return (
    <section aria-label={t("branding.preview.title")} className="branding-preview">
      <h2>{t("branding.preview.title")}</h2>
      <div className="branding-preview-band">
        <span
          aria-hidden="true"
          className="branding-preview-avatar"
          style={{
            backgroundColor: safeColor,
            borderColor: `${safeColor}55`,
          }}
        >
          {initial}
        </span>
        <div>
          <p className="branding-preview-name">{name}</p>
          <p className="branding-preview-caption">
            {t("branding.preview.captionName")}
          </p>
        </div>
      </div>
      <dl className="branding-preview-facts">
        <div>
          <dt>{t("branding.preview.captionColor")}</dt>
          <dd>
            <span
              aria-hidden="true"
              className="branding-swatch"
              style={{ backgroundColor: safeColor }}
            />
            <bdi className="branding-mono" dir="ltr">
              {color}
            </bdi>
          </dd>
        </div>
      </dl>
    </section>
  );
}
