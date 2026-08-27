"use client";

import { useReducer, type ReactNode } from "react";
import type {
  BrandingClearRequest,
  BrandingSetRequest,
} from "@valet/contracts";

import { PageHeader } from "../../components/ui/page-header";
import { useTranslation } from "../../i18n/locale-provider";
import type { TranslationKey } from "../../i18n/translations/types";
import { formatTimestamp } from "../../lib/format/datetime-format";
import { useDashboardLocation } from "../location/location-context";
import {
  BRANDING_SETTING_ORDER,
  brandingFailureMessageKey,
  findBrandingProjection,
  isSupportedBrandingSetting,
} from "./branding-state";
import { BrandingPreviewCard } from "./branding-preview-card";
import { BrandingRow } from "./branding-row";
import {
  initialBrandingTransientUi,
  reduceBrandingTransientUi,
} from "./branding-ui";
import { BrandingEditorDialog } from "./branding-editor-dialog";
import { ClearBrandingDialog } from "./clear-branding-dialog";
import { brandingSettingLabelKey } from "./branding-labels";
import { useBranding, type UseBrandingResult } from "./use-branding";
import "./branding.css";

/**
 * /branding surface (D4-004): real typed location branding against the
 * verified backend contracts. Company defaults are read-only; exactly the
 * two supported settings (display name, primary color) expose
 * Company default -> Location override -> Applied value, driven by the
 * backend-provided effective values and guarded by optimistic concurrency.
 *
 * LOCATION IDENTITY BOUNDARY: every location-specific piece of UI — preview,
 * rows, banners AND transient view-local state (open editor with its unsaved
 * draft, pending clear confirmation) — lives in BrandingSurface, which is
 * KEYED by the selected authorized location id. Switching A→B unmounts the
 * whole A surface and mounts a fresh B surface, so nothing of A can remain
 * visible under B by construction (no scattered cleanup).
 */
export function BrandingView() {
  const { t } = useTranslation();
  const branding = useBranding();
  const locationKey =
    branding.locationId.length > 0 ? branding.locationId : "none";

  return (
    <div className="page-shell">
      <PageHeader
        description={t("page.branding.description")}
        title={t("page.branding.title")}
      />
      <p className="contract-note">{t("branding.note")}</p>
      <BrandingSurface branding={branding} key={locationKey} />
    </div>
  );
}

function BrandingSurface(props: { branding: UseBrandingResult }) {
  const { t, locale } = useTranslation();
  const location = useDashboardLocation();
  const { branding } = props;
  const { snapshot } = branding;

  // Transient surfaces only; this component unmounts wholesale on a
  // location switch, discarding editor/draft/clear-confirm with it.
  const [ui, dispatchUi] = useReducer(
    reduceBrandingTransientUi,
    undefined,
    initialBrandingTransientUi,
  );

  const ready = snapshot.phase === "ready" && snapshot.data !== null;
  const data = snapshot.data;

  /** While a conflict is unresolved every write stays blocked: reload first. */
  const writesBlocked =
    snapshot.pendingMutation !== null || snapshot.conflict !== null;

  const editorProjection: ReturnType<typeof findBrandingProjection> | null =
    ui.editorOpenFor !== null && data !== null
      ? findBrandingProjection(data, ui.editorOpenFor)
      : null;
  const clearSetting =
    ui.clearConfirmFor !== null &&
    data !== null &&
    isSupportedBrandingSetting(ui.clearConfirmFor)
      ? ui.clearConfirmFor
      : null;

  return (
    <>
      {snapshot.phase === "loading" && (
        <div className="branding-loading" role="status">
          {t("branding.state.loading")}
        </div>
      )}

      {snapshot.phase === "error" && (
        <div className="error-state" role="alert">
          <p>{t("branding.state.loadFailed")}</p>
          <button
            type="button"
            className="btn-secondary"
            onClick={branding.reload}
          >
            {t("common.retry")}
          </button>
        </div>
      )}

      {ready && data !== null && (
        <>
          <div className="branding-metadata">
            <div>
              <span>{t("branding.metadata.updatedAt")}</span>
              <p>{formatTimestamp(data.updatedAt, locale, location?.timezone)}</p>
            </div>
          </div>

          {snapshot.conflict !== null && (
            <div className="branding-banner is-conflict" role="alert">
              <div>
                <strong>{t("branding.conflict.title")}</strong>
                <p>{t("branding.conflict.body")}</p>
                <p className="branding-banner-intent">
                  {conflictIntentText(
                    snapshot.conflict.attemptedRequest,
                    t,
                  )}
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={branding.reload}
              >
                {t("branding.conflict.reload")}
              </button>
            </div>
          )}

          {snapshot.mutationError !== null && (
            <div className="branding-banner" role="status">
              <span>
                {t(brandingFailureMessageKey(snapshot.mutationError))}
              </span>
              <button
                type="button"
                className="btn-secondary"
                onClick={branding.dismissMutationError}
              >
                {t("common.close")}
              </button>
            </div>
          )}

          <BrandingPreviewCard data={data} />

          <div aria-hidden="true" className="branding-columns">
            <span>{t("branding.columns.setting")}</span>
            <span>{t("branding.columns.companyDefault")}</span>
            <span>{t("branding.columns.locationOverride")}</span>
            <span>{t("branding.columns.applied")}</span>
            <span>{t("branding.columns.actions")}</span>
          </div>

          <div className="branding-rows">
            {BRANDING_SETTING_ORDER.map((key) => {
              const projection = findBrandingProjection(data, key);
              return (
                <BrandingRow
                  disabled={writesBlocked}
                  key={key}
                  onClear={() =>
                    dispatchUi({ setting: key, type: "clear-requested" })
                  }
                  onSetOrEdit={() =>
                    dispatchUi({ setting: key, type: "editor-opened" })
                  }
                  projection={projection}
                  setting={key}
                />
              );
            })}
          </div>
        </>
      )}

      {editorProjection !== null && ui.editorOpenFor !== null && (
        <BrandingEditorDialog
          // Remount per setting (D5-001): the editor holds its draft in
          // mount state; switching settings without a close must never
          // carry the previous setting's draft into this one.
          key={ui.editorOpenFor}
          onClose={() => dispatchUi({ type: "editor-dismissed" })}
          onSave={(value) => {
            if (ui.editorOpenFor === null) return;
            branding.setOverride({ setting: ui.editorOpenFor, value });
            dispatchUi({ type: "editor-dismissed" });
          }}
          pending={
            snapshot.pendingMutation !== null &&
            snapshot.pendingMutation === ui.editorOpenFor
          }
          projection={editorProjection}
          setting={ui.editorOpenFor}
        />
      )}

      {clearSetting !== null && (
        <ClearBrandingDialog
          busy={
            snapshot.pendingMutation !== null &&
            snapshot.pendingMutation === clearSetting
          }
          onCancel={() => dispatchUi({ type: "clear-dismissed" })}
          onConfirm={() => {
            branding.clearOverride(clearSetting);
            dispatchUi({ type: "clear-dismissed" });
          }}
          settingLabel={t(brandingSettingLabelKey(clearSetting))}
        />
      )}
    </>
  );
}

/**
 * Preserved-intent summary for the conflict banner: shows exactly what the
 * user attempted (value or clear) against the setting's human label, so the
 * deliberate retry after reload is an informed decision. Identifier-like
 * values are bidi-isolated so they cannot scramble under RTL.
 */
function conflictIntentText(
  request: BrandingSetRequest | BrandingClearRequest,
  t: (key: TranslationKey) => string,
): ReactNode {
  const label = t(brandingSettingLabelKey(request.setting));
  if ("value" in request) {
    return (
      <>
        {label}:{" "}
        <bdi dir={request.setting === "brandPrimaryColor" ? "ltr" : undefined}>
          {request.value}
        </bdi>
      </>
    );
  }
  return `${label}: ${t("branding.clear.confirm")}`;
}
