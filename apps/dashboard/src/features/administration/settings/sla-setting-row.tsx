"use client";

import { useState } from "react";

import type { DashboardLocale } from "../../../lib/i18n/locale";
import { ScopedContextHelp } from "../../help/scoped-context-help";
import { administrationCopy } from "../administration-copy";
import { styles } from "../administration-ui";
import { settingsTableCopy } from "./settings-copy";

export function SlaSettingRow(props: {
  readonly disabled?: boolean;
  readonly locale: DashboardLocale;
  readonly onClear: () => void;
  readonly onSet: (value: number) => void;
  readonly value: number | null;
}) {
  const t = administrationCopy(props.locale);
  const copy = settingsTableCopy(props.locale);
  const [draft, setDraft] = useState(props.value === null ? "" : String(props.value));
  const parsed = Number(draft);
  const valid = Number.isInteger(parsed) && parsed >= 30 && parsed <= 3600;
  return (
    <tr data-setting="slaTargetSeconds">
      <td>
        <div className={styles.strong}>{copy.slaTarget}</div>
        <div className={styles.muted}>{props.value === null ? "—" : props.value} · {copy.slaRange}</div>
      </td>
      <td>
        <input aria-label={copy.editValue(copy.slaTarget)} className={styles.input} dir="ltr" disabled={props.disabled} id="setting-slaTargetSeconds"
          inputMode="numeric" max={3600} min={30} onChange={(event) => setDraft(event.target.value)}
          type="number" value={draft} />
      </td>
      <td><div className={styles.actions}>
        <button className={styles.primary} disabled={props.disabled || !valid || parsed === props.value}
          onClick={() => props.onSet(parsed)} type="button">{t.save}</button>
        <ScopedContextHelp helpKey="setting.slaTargetSeconds" />
        <button className={styles.secondary} disabled={props.disabled || props.value === null}
          onClick={props.onClear} type="button">{t.clearOverride}</button>
      </div></td>
    </tr>
  );
}
