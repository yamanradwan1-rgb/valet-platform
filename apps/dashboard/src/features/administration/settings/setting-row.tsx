"use client";

import { useState } from "react";

import type { DashboardLocale } from "../../../lib/i18n/locale";
import { administrationCopy } from "../administration-copy";
import { styles } from "../administration-ui";
import type { SettingDefinition } from "./setting-definitions";
import {
  settingDisplayValue,
  settingEditorValue,
  settingOptionLabel,
  settingsTableCopy,
} from "./settings-copy";

export function SettingRow(props: {
  readonly canClear: boolean;
  readonly definition: SettingDefinition;
  readonly disabled?: boolean;
  readonly locale: DashboardLocale;
  readonly onClear?: () => void;
  readonly onSet: (value: string | boolean | number) => void;
  readonly overridePresent?: boolean;
  readonly value: unknown;
  readonly defaultValue?: unknown;
}) {
  const t = administrationCopy(props.locale);
  const copy = settingsTableCopy(props.locale);
  const [draft, setDraft] = useState(() => settingEditorValue(props.value));
  const id = `setting-${props.definition.key}`;
  const label = props.definition.labels[props.locale];
  function commit() {
    if (props.definition.kind === "boolean") props.onSet(draft === "true");
    else if (props.definition.kind === "integer") props.onSet(Number(draft));
    else props.onSet(draft);
  }
  return (
    <tr data-setting={props.definition.key}>
      <td>
        <div className={styles.strong}>{label}</div>
        <div className={styles.muted}>
          {props.overridePresent === true
            ? t.overridden
            : props.overridePresent === false
              ? t.inherited
              : t.effective}
          : <bdi>{settingDisplayValue(props.value, props.locale)}</bdi>
        </div>
        {props.overridePresent !== undefined ? (
          <div className={styles.muted}>
            {t.companyDefaults}:{" "}
            <bdi>{settingDisplayValue(props.defaultValue, props.locale)}</bdi>
          </div>
        ) : null}
      </td>
      <td>
        {props.definition.kind === "boolean" ? (
          <select
            aria-label={copy.editValue(label)}
            className={styles.select}
            disabled={props.disabled}
            id={id}
            onChange={(e) => setDraft(e.target.value)}
            value={draft}
          >
            <option value="true">{copy.yes}</option>
            <option value="false">{copy.no}</option>
          </select>
        ) : props.definition.kind === "select" ? (
          <select
            aria-label={copy.editValue(label)}
            className={styles.select}
            disabled={props.disabled}
            id={id}
            onChange={(e) => setDraft(e.target.value)}
            value={draft}
          >
            {props.definition.options?.map((option) => (
              <option key={option} value={option}>
                {settingOptionLabel(option, props.locale)}
              </option>
            ))}
          </select>
        ) : (
          <input
            aria-label={copy.editValue(label)}
            className={styles.input}
            dir="ltr"
            disabled={props.disabled}
            id={id}
            inputMode={
              props.definition.kind === "integer" ? "numeric" : "decimal"
            }
            onChange={(e) => setDraft(e.target.value)}
            value={draft}
          />
        )}
      </td>
      <td>
        <div className={styles.actions}>
          <button
            className={styles.primary}
            disabled={
              props.disabled || draft === settingEditorValue(props.value)
            }
            onClick={commit}
            type="button"
          >
            {t.save}
          </button>
          {props.canClear && props.onClear ? (
            <button
              className={styles.secondary}
              disabled={props.disabled || props.overridePresent === false}
              onClick={props.onClear}
              type="button"
            >
              {t.clearOverride}
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
