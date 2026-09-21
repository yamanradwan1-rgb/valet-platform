"use client";

import {
  managementLocationSettingClearRequestSchema,
  managementLocationSettingSetRequestSchema,
  type ManagementLocationSettingsResponse,
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
import { SlaSettingRow } from "./sla-setting-row";
import { clearManagementLocationSetting, setManagementLocationSetting } from "./settings-api";

interface Projection { readonly effective: unknown; readonly overridePresent: boolean; }

export function ManagementLocationSettingsPanel(props: {
  readonly api: DashboardApiClient;
  readonly data: ManagementLocationSettingsResponse;
  readonly locale: DashboardLocale;
  readonly onReload: () => void;
}) {
  const mutation = useSensitiveMutation(props.onReload);
  const copy = settingsTableCopy(props.locale);
  const projections = props.data.settings as unknown as Readonly<Record<string, Projection | unknown>>;
  async function setValue(setting: string, value: unknown) {
    const body = managementLocationSettingSetRequestSchema.parse({ setting, value, expectedUpdatedAt: props.data.updatedAt });
    await mutation.run(() => setManagementLocationSetting(props.api, props.data.organizationId, props.data.locationId, body), props.onReload);
  }
  async function clearValue(setting: string) {
    const body = managementLocationSettingClearRequestSchema.parse({ setting, expectedUpdatedAt: props.data.updatedAt });
    await mutation.run(() => clearManagementLocationSetting(props.api, props.data.organizationId, props.data.locationId, body), props.onReload);
  }
  const projection = (key: string) => projections[key] as Projection;
  const hours = props.data.settings.operatingHours;
  return (
    <>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>{copy.setting}</th><th>{copy.value}</th><th>{copy.actions}</th></tr></thead>
          <tbody>
        {settingDefinitions.map((definition) => <SettingRow canClear definition={definition}
          disabled={mutation.busy} key={definition.key} locale={props.locale}
          onClear={() => void clearValue(definition.key)}
          onSet={(value) => void setValue(definition.key, value)}
          overridePresent={projection(definition.key).overridePresent}
          value={projection(definition.key).effective} />)}
        <OperatingHoursEditor canClear disabled={mutation.busy} locale={props.locale}
          onClear={() => void clearValue("operatingHours")}
          onSave={(value: OperatingHoursValue) => void setValue("operatingHours", value)}
          overridePresent={hours.overridePresent} value={hours.effective} />
        <SlaSettingRow disabled={mutation.busy} locale={props.locale}
          onClear={() => void clearValue("slaTargetSeconds")}
          onSet={(value) => void setValue("slaTargetSeconds", value)}
          value={props.data.settings.slaTargetSeconds} />
          </tbody>
        </table>
      </div>
      {mutation.error ? <div className={styles.error} role="alert">{mutation.error}</div> : null}
      {mutation.mfaOpen ? <SensitiveMfaDialog api={props.api} onAssured={mutation.onMfaAssured} onClose={mutation.closeMfa} /> : null}
    </>
  );
}
