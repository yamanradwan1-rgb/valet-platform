"use client";

import { useId, useState, type FormEvent } from "react";

import { demoEmployees } from "./investigation-demo-fixtures";
import type { InvestigationDemoQuery } from "./investigation-demo-types";
import {
  hasValidInvestigationWindow,
  investigationPanelCopy,
} from "./investigation/search/investigation-panel-copy";
import type { InvestigationSelectorOption } from "./investigation/search/investigation-selector-resolution";
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
}: SearchPanelProps) {
  const t = investigationPanelCopy[locale];
  const fieldsId = useId();
  const errorId = useId();
  const slotListId = useId();
  const [collapsed, setCollapsed] = useState(false);
  const [invalid, setInvalid] = useState(false);

  function change(field: SearchField, next: string) {
    setInvalid(false);
    onChange({ ...value, [field]: next });
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasValidInvestigationWindow(value)) {
      setInvalid(true);
      setCollapsed(false);
      return;
    }
    if (live && (!value.location || !locationName || selectorError)) {
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
  const invalidWindow = invalid && !hasValidInvestigationWindow(value);
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
          <label className={styles.field} key={key}>
            <span>{label}</span>
            <input
              aria-describedby={describedBy}
              aria-invalid={invalidWindow}
              className={styles.control}
              dir="ltr"
              onChange={(event) => change(key, event.target.value)}
              required
              step={type === "time" ? 60 : undefined}
              type={type}
              value={value[key]}
            />
          </label>
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
          <label className={styles.field}>
            <span>{t.employee}</span>
            <select
              className={styles.control}
              onChange={(event) => change("employee", event.target.value)}
              value={value.employee}
            >
              <option value="">{t.anyEmployee}</option>
              {(live
                ? employeeOptions
                : demoEmployees.map((label) => ({ id: label, label }))
              ).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
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
                change("sessionId", event.target.value.toUpperCase())
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
