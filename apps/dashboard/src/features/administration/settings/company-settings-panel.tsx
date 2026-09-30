"use client";

import {
  managementCompanySettingClearRequestSchema,
  managementSettingSetRequestSchema,
  type ManagementCompanySettingsResponse,
  type OperatingHoursValue,
} from "@valet/contracts";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import type { DashboardLocale } from "../../../lib/i18n/locale";
import { SensitiveMfaDialog } from "../sensitive-mfa-dialog";
import { styles } from "../administration-ui";
import { useSensitiveMutation } from "../use-sensitive-mutation";
import { OperatingHoursEditor } from "./operating-hours-editor";
import { settingDefinitions } from "./setting-definitions";
import { SettingRow } from "./setting-row";
import { settingsTableCopy } from "./settings-copy";
import { clearCompanySetting, setCompanySetting } from "./settings-api";

export function CompanySettingsPanel(props: {
  readonly api: DashboardApiClient;
  readonly data: ManagementCompanySettingsResponse;
  readonly locale: DashboardLocale;
  readonly onReload: () => void;
}) {
  const mutation = useSensitiveMutation(
    `company-settings:${props.data.organizationId}:${props.data.updatedAt}`,
    props.onReload,
  );
  const copy = settingsTableCopy(props.locale);
  const defaults = props.data.defaults as unknown as Readonly<
    Record<string, unknown>
  >;
  async function setValue(setting: string, value: unknown) {
    await mutation.run(() => {
      const body = managementSettingSetRequestSchema.parse({
        setting,
        value,
        expectedUpdatedAt: props.data.updatedAt,
      });
      return setCompanySetting(props.api, props.data.organizationId, body);
    }, props.onReload);
  }
  async function clearOperatingHours() {
    await mutation.run(() => {
      const body = managementCompanySettingClearRequestSchema.parse({
        setting: "operatingHours",
        expectedUpdatedAt: props.data.updatedAt,
      });
      return clearCompanySetting(props.api, props.data.organizationId, body);
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
            {settingDefinitions.map((definition) => (
              <SettingRow
                canClear={false}
                definition={definition}
                disabled={mutation.busy}
                key={definition.key}
                locale={props.locale}
                onSet={(value) => void setValue(definition.key, value)}
                value={defaults[definition.key]}
              />
            ))}
            <OperatingHoursEditor
              canClear
              disabled={mutation.busy}
              locale={props.locale}
              onClear={() => void clearOperatingHours()}
              onSave={(value: OperatingHoursValue) =>
                void setValue("operatingHours", value)
              }
              value={props.data.defaults.operatingHours}
            />
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
