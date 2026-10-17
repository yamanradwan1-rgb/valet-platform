"use client";

import { useId, useState, type FormEvent } from "react";

import { demoEmployees } from "./investigation-demo-fixtures";
import type { InvestigationDemoQuery } from "./investigation-demo-types";
import styles from "./investigation-search.module.css";

type SearchField = keyof InvestigationDemoQuery;

type SearchPanelProps = {
  readonly locale: "en" | "ar";
  readonly value: InvestigationDemoQuery;
  readonly onChange: (query: InvestigationDemoQuery) => void;
  readonly onApply: () => void;
  readonly onClear: () => void;
  readonly error?: string | null;
};

const copy = {
  en: {
    title: "Find Sessions",
    subtitle: "Event time window · same Location · all filters combined",
    clear: "Clear",
    collapse: "Collapse filters",
    expand: "Show filters",
    apply: "Apply search ↗",
    location: "Location",
    locationName: "VAYLET Pilot North",
    date: "Event date",
    start: "From · inclusive",
    end: "To · exclusive",
    slot: "Key slot",
    employee: "Employee involvement",
    anyEmployee: "Any employee",
    make: "Make · current",
    model: "Model · current",
    plate: "Plate · current",
    sessionId: "Exact Session ID",
    truth:
      "Key/employee witnesses can be separate events. Search does not prove continuous custody, causality, or a historical name/vehicle snapshot.",
    timeError: "Choose a valid date and start time earlier than the end time.",
  },
  ar: {
    title: "البحث عن الجلسات",
    subtitle: "نافذة توقيت الحدث · موقع واحد · جمع الشروط",
    clear: "مسح",
    collapse: "طي المرشحات",
    expand: "إظهار المرشحات",
    apply: "تطبيق البحث ↗",
    location: "الموقع",
    locationName: "فايلت - الموقع التجريبي الشمالي",
    date: "تاريخ الحدث",
    start: "من · شامل",
    end: "إلى · غير شامل",
    slot: "خانة المفتاح",
    employee: "مشاركة الموظف",
    anyEmployee: "أي موظف",
    make: "الشركة · الحالية",
    model: "الطراز · الحالي",
    plate: "اللوحة · الحالية",
    sessionId: "معرّف الجلسة الدقيق",
    truth:
      "قد تظهر أدلة المفتاح والموظف في حدثين منفصلين؛ البحث لا يثبت الحيازة المستمرة أو السببية أو هوية تاريخية ثابتة.",
    timeError: "اختر تاريخًا صالحًا ووقت بداية يسبق وقت النهاية.",
  },
} as const;

function hasValidWindow(query: InvestigationDemoQuery): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(query.date)) {
    return false;
  }
  const date = new Date(query.date + "T00:00:00Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== query.date
  ) {
    return false;
  }
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  return (
    timePattern.test(query.start) &&
    timePattern.test(query.end) &&
    query.start < query.end
  );
}

export function InvestigationSearchPanel({
  locale,
  value,
  onChange,
  onApply,
  onClear,
  error,
}: SearchPanelProps) {
  const t = copy[locale];
  const fieldsId = useId();
  const errorId = useId();
  const [collapsed, setCollapsed] = useState(false);
  const [invalid, setInvalid] = useState(false);

  function change(field: SearchField, next: string) {
    setInvalid(false);
    onChange({ ...value, [field]: next });
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasValidWindow(value)) {
      setInvalid(true);
      setCollapsed(false);
      return;
    }
    setInvalid(false);
    onApply();
  }

  function clear() {
    setInvalid(false);
    onClear();
  }

  const describedBy = invalid || error ? errorId : undefined;
  const invalidWindow = invalid && !hasValidWindow(value);
  const displayedError = error || (invalidWindow ? t.timeError : null);
  const locationValue = value.location || "north";
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
            <option value={locationValue}>{t.locationName}</option>
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
            onChange={(event) =>
              change("slot", event.target.value.toUpperCase())
            }
            placeholder="K-07"
            spellCheck={false}
            type="text"
            value={value.slot}
          />
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
              {demoEmployees.map((label) => (
                <option key={label} value={label}>
                  {label}
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
              placeholder="Toyota"
              value={value.make}
            />
          </label>
          <label className={styles.field}>
            <span>{t.model}</span>
            <input
              className={styles.control}
              dir="auto"
              onChange={(event) => change("model", event.target.value)}
              placeholder="Camry"
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
              placeholder="DEM-214"
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
              placeholder="VS-DEMO-1021"
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
