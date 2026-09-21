"use client";

import type { OperatingHoursValue } from "@valet/contracts";
import { useState } from "react";

import type { DashboardLocale } from "../../../lib/i18n/locale";
import { administrationCopy } from "../administration-copy";
import { styles } from "../administration-ui";
import { settingsTableCopy, weekdayLabel } from "./settings-copy";

const weekdays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;

function initial(value: OperatingHoursValue | null): OperatingHoursValue {
  return value ?? { days: weekdays.map((weekday) => ({ weekday, status: "CLOSED" as const })) };
}

export function OperatingHoursEditor(props: {
  readonly canClear: boolean;
  readonly disabled?: boolean;
  readonly locale: DashboardLocale;
  readonly onClear?: () => void;
  readonly onSave: (value: OperatingHoursValue) => void;
  readonly overridePresent?: boolean;
  readonly value: OperatingHoursValue | null;
}) {
  const t = administrationCopy(props.locale);
  const copy = settingsTableCopy(props.locale);
  const [draft, setDraft] = useState(() => initial(props.value));
  function update(index: number, patch: Record<string, string>) {
    const days = draft.days.map((day, current) => {
      if (current !== index) return day;
      const status = patch.status ?? day.status;
      if (status === "CLOSED") return { weekday: day.weekday, status: "CLOSED" as const };
      return {
        weekday: day.weekday, status: "OPEN" as const,
        opensAt: patch.opensAt ?? (day.status === "OPEN" ? day.opensAt : "08:00"),
        closesAt: patch.closesAt ?? (day.status === "OPEN" ? day.closesAt : "17:00"),
      };
    });
    setDraft({ days });
  }
  return (
    <tr data-setting="operatingHours">
      <td><div className={styles.strong}>{copy.operatingHours}</div><div className={styles.muted}>{props.overridePresent === true ? t.overridden : props.overridePresent === false ? t.inherited : t.effective} · {copy.sevenDaySchedule}</div></td>
      <td><div className={styles.stack}>
        {draft.days.map((day, index) => {
          const dayLabel = weekdayLabel(day.weekday, props.locale);
          return <div className={styles.actions} key={day.weekday}>
            <span className={styles.muted}>{dayLabel}</span>
            <select aria-label={copy.dayStatus(dayLabel)} className={styles.select} disabled={props.disabled} onChange={(e) => update(index, { status: e.target.value })} value={day.status}>
              <option value="CLOSED">{copy.closed}</option><option value="OPEN">{copy.open}</option>
            </select>
            {day.status === "OPEN" ? <><input aria-label={copy.opensAt(dayLabel)} className={styles.input} dir="ltr" disabled={props.disabled} onChange={(e) => update(index, { opensAt: e.target.value })} type="time" value={day.opensAt} /><input aria-label={copy.closesAt(dayLabel)} className={styles.input} dir="ltr" disabled={props.disabled} onChange={(e) => update(index, { closesAt: e.target.value })} type="time" value={day.closesAt} /></> : null}
          </div>;
        })}
      </div></td>
      <td><div className={styles.actions}><button className={styles.primary} disabled={props.disabled} onClick={() => props.onSave(draft)} type="button">{t.save}</button>{props.canClear && props.onClear ? <button className={styles.secondary} disabled={props.disabled || props.overridePresent === false} onClick={props.onClear} type="button">{t.clearOverride}</button> : null}</div></td>
    </tr>
  );
}
