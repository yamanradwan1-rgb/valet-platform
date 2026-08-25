"use client";

import { useReducer } from "react";
import type {
  ClearConfigurationOverrideRequest,
  ConfigurationSettingProjection,
  SetConfigurationOverrideRequest,
} from "@valet/contracts";

import { PageHeader } from "../../components/ui/page-header";
import { useTranslation } from "../../i18n/locale-provider";
import type { TranslationKey } from "../../i18n/translations/types";
import { formatTimestamp } from "../../lib/format/datetime-format";
import {
  settingDisplayText,
  settingLabelKey,
  settingValueDisplay,
} from "./configuration-labels";
import {
  CONFIGURATION_SETTING_ORDER,
  configurationFailureMessageKey,
  findConfigurationSetting,
} from "./configuration-state";
import { ClearOverrideDialog } from "./clear-override-dialog";
import {
  initialTransientUi,
  reduceTransientUi,
} from "./location-settings-ui";
import { OverrideEditorSheet } from "./override-editor-sheet";
import { SettingRow } from "./setting-row";
import { useLocationConfiguration } from "./use-location-configuration";
import "./location-settings.css";

/**
 * /location-settings surface (D4-003): real typed Location Configuration
 * against the verified backend contracts. Company defaults are read-only;
 * exactly the ten supported settings expose Company default ->
 * Location override -> Applied value, driven by the backend-provided
 * effective values and guarded by optimistic concurrency.
 *
 * LOCATION IDENTITY BOUNDARY: every location-specific piece of UI — rows,
 * banners AND transient view-local state (open editor with its unsaved
 * draft, pending clear confirmation) — lives in LocationSettingsSurface,
 * which is KEYED by the selected authorized location id. Switching A→B
 * unmounts the whole A surface and mounts a fresh B surface, so nothing of
 * A can remain visible under B by construction (no scattered cleanup).
 */
export function LocationSettingsView() {
  const { t } = useTranslation();
  const config = useLocationConfiguration();
  const locationKey = config.locationId.length > 0 ? config.locationId : "none";

  return (
    <div className="page-shell">
      <PageHeader
        description={t("page.locationSettings.description")}
        title={t("page.locationSettings.title")}
      />
      <p className="contract-note">{t("config.note")}</p>
      <LocationSettingsSurface key={locationKey} config={config} />
    </div>
  );
}

function LocationSettingsSurface(props: {
  config: ReturnType<typeof useLocationConfiguration>;
}) {
  const { t, locale } = useTranslation();
  const { config } = props;
  const { snapshot } = config;

  // Transient surfaces only; this component unmounts wholesale on a
  // location switch, discarding editor/draft/clear-confirm with it.
  const [ui, dispatchUi] = useReducer(
    reduceTransientUi,
    undefined,
    initialTransientUi,
  );

  const ready = snapshot.phase === "ready" && snapshot.data !== null;
  const data = snapshot.data;

  /** While a conflict is unresolved every write stays blocked: reload first. */
  const writesBlocked =
    snapshot.pendingMutation !== null || snapshot.conflict !== null;

  const editorProjection: ConfigurationSettingProjection | undefined =
    ui.editorOpenFor !== null && data !== null
      ? findConfigurationSetting(data, ui.editorOpenFor)
      : undefined;
  const clearProjection: ConfigurationSettingProjection | undefined =
    ui.clearConfirmFor !== null && data !== null
      ? findConfigurationSetting(data, ui.clearConfirmFor)
      : undefined;

  return (
    <>
      {snapshot.phase === "loading" && (
        <div className="config-loading" role="status">
          {t("config.state.loading")}
        </div>
      )}

      {snapshot.phase === "error" && (
        <div className="error-state" role="alert">
          <p>{t("config.state.loadFailed")}</p>
          <button
            type="button"
            className="btn-secondary"
            onClick={config.reload}
          >
            {t("common.retry")}
          </button>
        </div>
      )}

      {ready && data !== null && (
        <>
          <div
            className="config-metadata"
            aria-label={t("page.locationSettings.title")}
          >
            <div>
              <span>{t("config.metadata.timezone")}</span>
              <p>{data.timezone}</p>
            </div>
            <div>
              <span>{t("config.metadata.currency")}</span>
              <p>{data.currency}</p>
            </div>
            <div>
              <span>{t("config.metadata.updatedAt")}</span>
              <p>{formatTimestamp(data.updatedAt, locale)}</p>
            </div>
          </div>

          {snapshot.conflict !== null && (
            <div className="config-banner is-conflict" role="alert">
              <div>
                <strong>{t("config.conflict.title")}</strong>
                <p>{t("config.conflict.body")}</p>
                <p className="config-banner-intent">
                  {conflictIntentText(
                    snapshot.conflict.attemptedRequest,
                    data.currency,
                    t,
                  )}
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={config.reload}
              >
                {t("config.conflict.reload")}
              </button>
            </div>
          )}

          {snapshot.mutationError !== null && (
            <div className="config-banner" role="status">
              <span>
                {t(configurationFailureMessageKey(snapshot.mutationError))}
              </span>
              <button
                type="button"
                className="btn-secondary"
                onClick={config.dismissMutationError}
              >
                {t("common.close")}
              </button>
            </div>
          )}

          <div className="config-columns" aria-hidden="true">
            <span>{t("config.columns.setting")}</span>
            <span>{t("config.columns.companyDefault")}</span>
            <span>{t("config.columns.locationOverride")}</span>
            <span>{t("config.columns.applied")}</span>
            <span>{t("config.columns.actions")}</span>
          </div>

          <div className="config-rows">
            {CONFIGURATION_SETTING_ORDER.map((key) => {
              const projection = findConfigurationSetting(data, key);
              if (projection === undefined) return null;
              return (
                <SettingRow
                  key={key}
                  currency={data.currency}
                  disabled={writesBlocked}
                  onClear={() =>
                    dispatchUi({ setting: key, type: "clear-requested" })
                  }
                  onSetOrEdit={() =>
                    dispatchUi({ setting: key, type: "editor-opened" })
                  }
                  projection={projection}
                />
              );
            })}
          </div>
        </>
      )}

      {editorProjection !== undefined && (
        <OverrideEditorSheet
          key={editorProjection.setting}
          currency={data?.currency ?? ""}
          pending={snapshot.pendingMutation === editorProjection.setting}
          onClose={() => dispatchUi({ type: "editor-dismissed" })}
          onSave={(value) => {
            if (editorProjection === undefined) return;
            config.setOverride({ setting: editorProjection.setting, value });
            dispatchUi({ type: "editor-dismissed" });
          }}
          projection={editorProjection}
        />
      )}

      {clearProjection !== undefined && (
        <ClearOverrideDialog
          busy={snapshot.pendingMutation === clearProjection.setting}
          onCancel={() => dispatchUi({ type: "clear-dismissed" })}
          onConfirm={() => {
            config.clearOverride(clearProjection.setting);
            dispatchUi({ type: "clear-dismissed" });
          }}
          settingLabel={t(settingLabelKey(clearProjection.setting))}
        />
      )}
    </>
  );
}

/**
 * Preserved-intent summary line for the conflict banner: shows exactly what
 * the user attempted (value or clear) against the setting's human label, so
 * the deliberate retry after reload is an informed decision.
 */
function conflictIntentText(
  request:
    | SetConfigurationOverrideRequest
    | ClearConfigurationOverrideRequest,
  currency: string,
  t: (key: TranslationKey) => string,
): string {
  const label = t(settingLabelKey(request.setting));
  if ("value" in request) {
    return `${label}: ${settingDisplayText(
      settingValueDisplay(request.setting, request.value, currency),
      t,
    )}`;
  }
  return `${label}: ${t("config.clear.confirm")}`;
}
