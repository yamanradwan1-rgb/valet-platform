"use client";

import { useId, useState, type FormEvent } from "react";

import { demoEmployees } from "./investigation-demo-fixtures";
import type { InvestigationDemoQuery } from "./investigation-demo-types";
import {
  hasValidInvestigationWindow,
  investigationPanelCopy,
} from "./investigation/search/investigation-panel-copy";
import type { InvestigationSelectorOption } from "./investigation/search/investigation-selector-resolution";
import { InvestigationEmployeeSelector } from "./investigation/search/investigation-employee-selector";
import { InvestigationTimeDisambiguation } from "./investigation/search/investigation-time-disambiguation";
import { investigationMinuteCandidates } from "./investigation-live-timezone";
import styles from "./investigation-search.module.css";

type SearchField = keyof InvestigationDemoQuery;

type SearchPanelProps = {
  readonly locale: "en" | "ar";
  readonly value: InvestigationDemoQuery;
  readonly onChange: (query: InvestigationDemoQuery) => void;
  readonly onApply: () => void;
  readonly onClear: () => void;
  readonly error?: string | null;
  readonly live?: boolean;
  readonly locationName?: string;
  readonly employeeOptions?: readonly InvestigationSelectorOption[];
  readonly slotOptions?: readonly InvestigationSelectorOption[];
  readonly selectorError?: string | null;
  readonly locationTimezone?: string;
  readonly memberOversized?: boolean;
  readonly memberBusy?: boolean;
  readonly memberError?: string | null;
  readonly memberUnpaged?: boolean;
  readonly memberPage?: number;
  readonly memberHasNext?: boolean;
  readonly memberHasPrevious?: boolean;
  readonly onMemberChange?: (id: string) => void;
  readonly onMemberRefine?: (text: string) => void;
  readonly onMemberNext?: () => void;
  readonly onMemberPrevious?: () => void;
};

export function InvestigationSearchPanel({
  locale,
  value,
  onChange,
  onApply,
  onClear,
  error,
  live = false,
  locationName,
  employeeOptions = [],
  slotOptions = [],
  selectorError,
  locationTimezone = "Asia/Amman",
  memberOversized, memberBusy, memberError, memberUnpaged,
  memberPage, memberHasNext, memberHasPrevious, onMemberChange,
  onMemberRefine, onMemberNext, onMemberPrevious,
}: SearchPanelProps) {
  const t = investigationPanelCopy[locale];
  const fieldsId = useId();
  const errorId = useId();
  const slotListId = useId();
  const startId = useId();
  const endId = useId();
  const [collapsed, setCollapsed] = useState(false);
  const [invalid, setInvalid] = useState(false);

  function change(field: SearchField, next: string) {
    setInvalid(false);
    onChange({ ...value, [field]: next,
      ...(["date", "start", "end", "location"].includes(field)
        ? { fromUtc: undefined, toUtc: undefined } : {}),
    });
  }

  function validLiveWindow() {
    if (!live) return hasValidInvestigationWindow(value);
    try {
      const from = investigationMinuteCandidates(value.date, value.start, locationTimezone);
      const to = investigationMinuteCandidates(value.date, value.end, locationTimezone);
      const start = from.find((candidate) => candidate.utc === value.fromUtc)
        ?? (from.length === 1 ? from[0] : null);
      const end = to.find((candidate) => candidate.utc === value.toUtc)
        ?? (to.length === 1 ? to[0] : null);
      return Boolean(start && end && start.utc < end.utc);
    } catch { return false; }
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validLiveWindow()) {
      setInvalid(true);
      setCollapsed(false);
      return;
    }
    if (live && (!value.location || !locationName)) {
      return;
    }
    setInvalid(false);
    onApply();
  }

  function clear() {
    setInvalid(false);
    onClear();
  }

  const describedBy =
    invalid || error || (live && selectorError) ? errorId : undefined;
  const invalidWindow = invalid && !validLiveWindow();
  const displayedError =
    error ||
    (invalidWindow ? t.timeError : null) ||
    (live ? selectorError : null);
  const locationValue = live ? value.location : value.location || "north";
  const temporalFields = [
    { key: "date", label: t.date, type: "date" },
    { key: "start", label: t.start, type: "time" },
    { key: "end", label: t.end, type: "time" },
  ] as const;

  return (
    <form
      aria-label={t.title}
      className={styles.card}
      dir={locale === "ar" ? "rtl" : "ltr"}
      noValidate
      onSubmit={apply}
    >
      <div className={styles.heading}>
        <div className={styles.headingCopy}>
          <h2 className={styles.title}>{t.title}</h2>
          <p className={styles.subtitle}>{t.subtitle}</p>
        </div>
        <div className={styles.actions}>
          <button className={styles.clearButton} onClick={clear} type="button">
            {t.clear}
          </button>
          <button
            aria-controls={fieldsId}
            aria-expanded={!collapsed}
            className={styles.secondaryButton}
            onClick={() => setCollapsed((current) => !current)}
            type="button"
          >
            {collapsed ? t.expand : t.collapse}
          </button>
          <button className={styles.applyButton} type="submit">
            {t.apply}
          </button>
        </div>
      </div>

      <div className={styles.formGrid} hidden={collapsed} id={fieldsId}>
        <label className={`${styles.field} ${styles.locationField}`}>
          <span>{t.location}</span>
          <select
            className={styles.control}
            onChange={(event) => change("location", event.target.value)}
            value={locationValue}
          >
            <option value={locationValue}>
              {live ? (locationName ?? "") : t.locationName}
            </option>
          </select>
        </label>
        {temporalFields.map(({ key, label, type }) => (
          <div className={styles.field} key={key}>
            <label htmlFor={key === "start" ? startId : key === "end" ? endId : fieldsId + "-date"}>{label}</label>
            <input
              id={key === "start" ? startId : key === "end" ? endId : fieldsId + "-date"}
              aria-describedby={live && type === "time"
                ? [describedBy, key === "start" ? startId + "-choice" : endId + "-choice"]
                  .filter(Boolean).join(" ") : describedBy}
              aria-invalid={invalidWindow}
              className={styles.control}
              dir="ltr"
              onChange={(event) => change(key, event.target.value)}
              required
              step={type === "time" ? 60 : undefined}
              type={type}
              value={value[key]}
            />
            {live && type === "time" && (
              <InvestigationTimeDisambiguation locale={locale} date={value.date}
                minute={value[key]} timezone={locationTimezone}
                value={key === "start" ? value.fromUtc : value.toUtc}
                describedBy={key === "start" ? startId + "-choice" : endId + "-choice"}
                onChange={(utc) => onChange({ ...value,
                  [key === "start" ? "fromUtc" : "toUtc"]: utc })} />
            )}
          </div>
        ))}
        <label className={`${styles.field} ${styles.slotField}`}>
          <span>{t.slot}</span>
          <input
            autoComplete="off"
            className={styles.control}
            dir="ltr"
            list={live ? slotListId : undefined}
            onChange={(event) =>
              change(
                "slot",
                live ? event.target.value : event.target.value.toUpperCase(),
              )
            }
            placeholder={live ? undefined : "K-07"}
            spellCheck={false}
            type="text"
            value={value.slot}
          />
          {live ? (
            <datalist id={slotListId}>
              {slotOptions.map((option) => (
                <option key={option.id} value={option.label} />
              ))}
            </datalist>
          ) : null}
        </label>

        <div className={styles.advanced}>
          <InvestigationEmployeeSelector locale={locale} label={t.employee}
            any={t.anyEmployee} value={value.employee}
            options={live ? employeeOptions : demoEmployees.map((label) => ({ id: label, label }))}
            oversized={live && memberOversized} loading={memberBusy} error={memberError}
            unpaged={memberUnpaged} page={memberPage} hasNext={memberHasNext}
            hasPrevious={memberHasPrevious} onChange={(id) => change("employee", id)}
            onRetain={onMemberChange} onRefine={onMemberRefine}
            onNext={onMemberNext} onPrevious={onMemberPrevious} />
          <label className={styles.field}>
            <span>{t.make}</span>
            <input
              className={styles.control}
              dir="auto"
              onChange={(event) => change("make", event.target.value)}
              placeholder={live ? undefined : "Toyota"}
              value={value.make}
            />
          </label>
          <label className={styles.field}>
            <span>{t.model}</span>
            <input
              className={styles.control}
              dir="auto"
              onChange={(event) => change("model", event.target.value)}
              placeholder={live ? undefined : "Camry"}
              value={value.model}
            />
          </label>
          <label className={styles.field}>
            <span>{t.plate}</span>
            <input
              className={styles.control}
              dir="ltr"
              onChange={(event) =>
                change("plate", event.target.value.toUpperCase())
              }
              placeholder={live ? undefined : "DEM-214"}
              spellCheck={false}
              value={value.plate}
            />
          </label>
          <label className={styles.field}>
            <span>{t.sessionId}</span>
            <input
              className={styles.control}
              dir="ltr"
              onChange={(event) =>
                change("sessionId", live ? event.target.value : event.target.value.toUpperCase())
              }
              placeholder={live ? undefined : "VS-DEMO-1021"}
              spellCheck={false}
              value={value.sessionId}
            />
          </label>
        </div>
        <p className={styles.disclaimer}>
          <span aria-hidden="true">ⓘ</span> {t.truth}
        </p>
      </div>
      {displayedError && (
        <p className={styles.error} id={errorId} role="alert">
          {displayedError}
        </p>
      )}
    </form>
  );
}
