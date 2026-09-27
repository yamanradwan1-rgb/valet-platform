"use client";

import {
  clearConfigurationOverrideRequestSchema,
  setConfigurationOverrideRequestSchema,
  type LocationConfigurationResponse,
} from "@valet/contracts";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import type { DashboardLocale } from "../../../lib/i18n/locale";
import { SensitiveMfaDialog } from "../sensitive-mfa-dialog";
import { styles } from "../administration-ui";
import { useSensitiveMutation } from "../use-sensitive-mutation";
import { legacyLocationKeys, settingDefinitions } from "./setting-definitions";
import { SettingRow } from "./setting-row";
import { settingsTableCopy } from "./settings-copy";
import {
  clearLocationManagerSetting,
  setLocationManagerSetting,
} from "./settings-api";

export function LocationManagerSettingsPanel(props: {
  readonly api: DashboardApiClient;
  readonly data: LocationConfigurationResponse;
  readonly locale: DashboardLocale;
  readonly onReload: () => void;
}) {
  const mutation = useSensitiveMutation(props.onReload);
  const copy = settingsTableCopy(props.locale);
  async function setValue(setting: string, value: unknown) {
    await mutation.run(() => {
      const body = setConfigurationOverrideRequestSchema.parse({
        setting,
        value,
        expectedUpdatedAt: props.data.updatedAt,
      });
      return setLocationManagerSetting(props.api, props.data.locationId, body);
    }, props.onReload);
  }
  async function clearValue(setting: string) {
    await mutation.run(() => {
      const body = clearConfigurationOverrideRequestSchema.parse({
        setting,
        expectedUpdatedAt: props.data.updatedAt,
      });
      return clearLocationManagerSetting(
        props.api,
        props.data.locationId,
        body,
      );
    }, props.onReload);
  }
  return (
    <>
      <div
        aria-label={copy.setting}
        className={styles.tableWrap}
        role="region"
        tabIndex={0}
      >
        <table className={`${styles.table} ${styles.referenceTable}`}>
          <thead>
            <tr>
              <th>{copy.setting}</th>
              <th>{copy.value}</th>
              <th>{copy.actions}</th>
            </tr>
          </thead>
          <tbody>
            {settingDefinitions
              .filter((definition) => legacyLocationKeys.has(definition.key))
              .map((definition) => {
                const item = props.data.settings.find(
                  (setting) => setting.setting === definition.key,
                );
                if (!item) return null;
                return (
                  <SettingRow
                    canClear
                    definition={definition}
                    disabled={mutation.busy}
                    key={definition.key}
                    locale={props.locale}
                    onClear={() => void clearValue(definition.key)}
                    onSet={(value) => void setValue(definition.key, value)}
                    overridePresent={item.overridePresent}
                    defaultValue={item.default}
                    value={item.effective}
                  />
                );
              })}
          </tbody>
        </table>
      </div>
      {mutation.error ? (
        <div className={styles.error} role="alert">
          {mutation.error}
        </div>
      ) : null}
      {mutation.mfaOpen ? (
        <SensitiveMfaDialog
          api={props.api}
          onAssured={mutation.onMfaAssured}
          onClose={mutation.closeMfa}
        />
      ) : null}
    </>
  );
}
