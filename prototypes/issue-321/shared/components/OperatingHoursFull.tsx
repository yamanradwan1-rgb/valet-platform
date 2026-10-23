import { useEffect, useId, useRef, useState } from "react";
import { HelpDialog } from "./HelpDialog";
import "./operating-hours-full.css";

const weekdays = [
  "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY",
] as const;

type Weekday = (typeof weekdays)[number];
type ClosedDay = { weekday: Weekday; status: "CLOSED" };
type OpenDay = { weekday: Weekday; status: "OPEN"; opensAt: string; closesAt: string };
type ScheduleDay = ClosedDay | OpenDay;
export type Schedule = { days: ScheduleDay[] };
type Locale = "en" | "ar";
type Scope = "company" | "location";

export interface OperatingHoursFullProps {
  readonly locale: Locale;
  readonly scope: Scope;
  readonly onDirtyChange?: (dirty: boolean) => void;
  readonly savedCompany?: Schedule | null;
  readonly savedLocation?: Schedule | null;
  readonly onSavedSchedule?: (scope: Scope, schedule: Schedule | null) => void;
}

const labels = {
  en: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  ar: ["الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"],
};

const text = {
  en: {
    title: "Operating hours", intro: "A seven-day informational schedule. It does not block check-in or retrieval.",
    preview: "Prototype only · Changes are simulated in memory", company: "Company default", location: "Location override",
    noSchedule: "No company schedule has been saved.", inherited: "Inherited from Company",
    overridden: "Location override", draftOverride: "Unsaved Location override", noCompany: "No company schedule to inherit yet.",
    weekday: "Day", status: "Status", opens: "Opens", closes: "Closes", open: "Open", closed: "Closed",
    save: "Save schedule", discard: "Discard changes", create: "Create Location override",
    clearOverride: "Clear override", clearCompany: "Clear schedule", openDays: "open days",
    dirty: "Unsaved changes", saved: "No unsaved changes", missing: "Enter both times in HH:mm format.",
    invalid: "Closing time must be later than opening time on the same day.",
    invalidHeading: "Fix the following days before saving:", savedNotice: "Sample schedule saved in this preview.",
    cleared: "Sample schedule cleared.", restored: "Company inheritance restored.",
    discarded: "Unsaved changes discarded.", started: "Location override draft started from the effective Company schedule.",
  },
  ar: {
    title: "ساعات التشغيل", intro: "جدول أسبوعي معلوماتي؛ لا يمنع تسجيل الدخول أو استرجاع المركبات.",
    preview: "نموذج تجريبي فقط · التغييرات محاكاة في الذاكرة", company: "الإعداد الافتراضي للشركة", location: "استثناء الموقع",
    noSchedule: "لا يوجد جدول محفوظ للشركة.", inherited: "موروث من الشركة",
    overridden: "استثناء للموقع", draftOverride: "استثناء موقع غير محفوظ", noCompany: "لا يوجد جدول للشركة لوراثته بعد.",
    weekday: "اليوم", status: "الحالة", opens: "يفتح", closes: "يغلق", open: "مفتوح", closed: "مغلق",
    save: "حفظ الجدول", discard: "إلغاء التعديلات", create: "إنشاء استثناء للموقع",
    clearOverride: "إزالة الاستثناء", clearCompany: "إزالة الجدول", openDays: "أيام مفتوحة",
    dirty: "تعديلات غير محفوظة", saved: "لا توجد تعديلات غير محفوظة", missing: "أدخل وقتَي الفتح والإغلاق بصيغة HH:mm.",
    invalid: "يجب أن يكون وقت الإغلاق بعد الفتح في اليوم نفسه.",
    invalidHeading: "صحّح الأيام التالية قبل الحفظ:", savedNotice: "تم حفظ الجدول التجريبي في هذه المعاينة.",
    cleared: "تمت إزالة الجدول التجريبي.", restored: "تمت استعادة وراثة إعداد الشركة.",
    discarded: "تم إلغاء التعديلات غير المحفوظة.", started: "بدأ إنشاء استثناء الموقع باستخدام جدول الشركة الفعّال.",
  },
} as const;

// Unprovided snapshots use the production-empty sample: no configured schedule.
const blank = (): Schedule => ({ days: weekdays.map((weekday) => ({ weekday, status: "CLOSED" })) });
const copy = (schedule: Schedule | null): Schedule | null =>
  schedule === null ? null : { days: schedule.days.map((day) => ({ ...day })) };
const equal = (a: Schedule | null, b: Schedule | null) => JSON.stringify(a) === JSON.stringify(b);
const localTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function errorsFor(schedule: Schedule, locale: Locale): Record<number, string> {
  const errors: Record<number, string> = {};
  schedule.days.forEach((day, index) => {
    if (day.status !== "OPEN") return;
    if (!localTime.test(day.opensAt) || !localTime.test(day.closesAt)) errors[index] = text[locale].missing;
    else if (day.opensAt >= day.closesAt) errors[index] = text[locale].invalid;
  });
  return errors;
}

function WeekdayRow(props: {
  readonly day: ScheduleDay;
  readonly index: number;
  readonly locale: Locale;
  readonly idPrefix: string;
  readonly disabled: boolean;
  readonly error?: string;
  readonly onChange: (index: number, patch: Partial<OpenDay>) => void;
}) {
  const t = text[props.locale];
  const name = labels[props.locale][props.index];
  const rowId = `${props.idPrefix}-${props.index}`;
  return <div className="p321-hours-row" role="group" aria-labelledby={`${rowId}-day`}>
    <div className="p321-hours-day" id={`${rowId}-day`}><strong>{name}</strong>
      <span className={`p321-hours-dot ${props.day.status === "OPEN" ? "is-open" : ""}`} aria-hidden="true" /></div>
    <div className="p321-hours-status">
      <label className="p321-hours-mobile-label" htmlFor={`${rowId}-status`}>{t.status}</label>
      <select id={`${rowId}-status`} disabled={props.disabled} value={props.day.status}
        aria-label={`${name} — ${t.status}`}
        onChange={(event) => props.onChange(props.index, { status: event.target.value as OpenDay["status"] })}>
        <option value="CLOSED">{t.closed}</option><option value="OPEN">{t.open}</option>
      </select>
    </div>
    <div className="p321-hours-time">
      {props.day.status === "OPEN" ? <>
        <label className="p321-hours-mobile-label" htmlFor={`${rowId}-opens`}>{t.opens}</label>
        <input id={`${rowId}-opens`} type="time" step={60} dir="ltr" disabled={props.disabled}
          value={props.day.opensAt} aria-label={`${name} — ${t.opens}`}
          aria-invalid={Boolean(props.error)} aria-describedby={props.error ? `${rowId}-error` : undefined}
          onChange={(event) => props.onChange(props.index, { opensAt: event.target.value })} />
      </> : <span className="p321-hours-no-time" aria-hidden="true">—</span>}
    </div>
    <div className="p321-hours-time">
      {props.day.status === "OPEN" ? <>
        <label className="p321-hours-mobile-label" htmlFor={`${rowId}-closes`}>{t.closes}</label>
        <input id={`${rowId}-closes`} type="time" step={60} dir="ltr" disabled={props.disabled}
          value={props.day.closesAt} aria-label={`${name} — ${t.closes}`}
          aria-invalid={Boolean(props.error)} aria-describedby={props.error ? `${rowId}-error` : undefined}
          onChange={(event) => props.onChange(props.index, { closesAt: event.target.value })} />
      </> : <span className="p321-hours-no-time" aria-hidden="true">—</span>}
    </div>
    {props.error && <p className="p321-hours-field-error" id={`${rowId}-error`}>{props.error}</p>}
  </div>;
}

export function OperatingHoursFull({
  locale, scope, onDirtyChange, savedCompany, savedLocation, onSavedSchedule,
}: OperatingHoursFullProps) {
  const t = text[locale];
  const idPrefix = useId().replace(/:/g, "");
  const externalSaved = scope === "company" ? savedCompany : savedLocation;
  const snapshot = JSON.stringify(externalSaved ?? null);
  const [saved, setSaved] = useState<Schedule | null>(() => copy(externalSaved ?? null));
  const [draft, setDraft] = useState<Schedule | null>(() => copy(externalSaved ?? null) ?? (scope === "company" ? blank() : null));
  const [notice, setNotice] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const dirtyCallback = useRef(onDirtyChange);
  dirtyCallback.current = onDirtyChange;

  useEffect(() => {
    const next = JSON.parse(snapshot) as Schedule | null;
    setSaved(copy(next));
    setDraft(copy(next) ?? (scope === "company" ? blank() : null));
    setSubmitted(false);
  }, [scope, snapshot]);
  useEffect(() => { setNotice(""); }, [scope]);

  const dirty = scope === "location"
    ? !equal(draft, saved)
    : !equal(draft, saved ?? blank());
  useEffect(() => { dirtyCallback.current?.(dirty); }, [dirty]);
  useEffect(() => () => { dirtyCallback.current?.(false); }, []);

  const companyDefault = savedCompany === undefined
    ? (scope === "company" ? saved : null)
    : savedCompany;
  const effective = draft ?? companyDefault ?? blank();
  const errors = errorsFor(effective, locale);
  const invalid = Object.keys(errors).length > 0;
  useEffect(() => { if (submitted && invalid) errorRef.current?.focus(); }, [submitted, invalid]);

  function update(index: number, patch: Partial<OpenDay>) {
    if (!draft) return;
    setDraft({ days: draft.days.map((day, position): ScheduleDay => {
      if (index !== position) return day;
      const status = patch.status ?? day.status;
      if (status === "CLOSED") return { weekday: day.weekday, status: "CLOSED" };
      return {
        weekday: day.weekday, status: "OPEN",
        opensAt: patch.opensAt ?? (day.status === "OPEN" ? day.opensAt : "08:00"),
        closesAt: patch.closesAt ?? (day.status === "OPEN" ? day.closesAt : "17:00"),
      };
    }) });
    setNotice("");
    setSubmitted(false);
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    if (invalid) { setSubmitted(true); return; }
    const next = copy(draft);
    setSaved(copy(next));
    onSavedSchedule?.(scope, copy(next));
    setSubmitted(false);
    setNotice(t.savedNotice);
  }

  function clear() {
    setSaved(null);
    setDraft(scope === "company" ? blank() : null);
    onSavedSchedule?.(scope, null);
    setNotice(scope === "location" ? t.restored : t.cleared);
    setSubmitted(false);
  }

  function discard() {
    setDraft(copy(saved) ?? (scope === "company" ? blank() : null));
    setSubmitted(false);
    setNotice(t.discarded);
  }

  const inherited = scope === "location" && draft === null;
  const openDays = effective.days.filter((day) => day.status === "OPEN").length;
  return <section className="p321-hours-full" dir={locale === "ar" ? "rtl" : "ltr"} aria-labelledby={`${idPrefix}-heading`}>
    <div className="p321-hours-header">
      <div><div className="p321-hours-eyebrow">{scope === "company" ? t.company : t.location}</div>
        <h3 id={`${idPrefix}-heading`}>{t.title}</h3><p>{t.intro}</p></div>
      <HelpDialog helpKey="setting.operatingHours" locale={locale} fallback={t.title} />
    </div>
    <div className="p321-hours-meta">
      <span className="p321-hours-source">{scope === "company" ? (saved ? t.company : t.noSchedule)
        : inherited ? t.inherited : saved ? t.overridden : t.draftOverride}</span>
      <span>{openDays} / 7 {t.openDays}</span>
      <span className={dirty ? "p321-hours-unsaved" : "p321-hours-current"} role="status">
        {dirty ? t.dirty : t.saved}
      </span>
    </div>
    {scope === "location" && inherited && <div className="p321-hours-inheritance">
      <p>{companyDefault ? t.inherited : t.noCompany}</p>
      <button className="p321-outline" type="button" onClick={() => {
        setDraft(copy(effective)); setNotice(t.started); setSubmitted(false);
      }}>{t.create}</button>
    </div>}
    <form noValidate onSubmit={save}>
      {submitted && invalid && <div className="p321-hours-error-summary" ref={errorRef} role="alert" tabIndex={-1}>
        <strong>{t.invalidHeading}</strong><ul>{Object.entries(errors).map(([index, message]) =>
          <li key={index}><a href={`#${idPrefix}-${index}-opens`}>{labels[locale][Number(index)]}: {message}</a></li>)}</ul>
      </div>}
      <div className="p321-hours-table-head" aria-hidden="true">
        <span>{t.weekday}</span><span>{t.status}</span><span>{t.opens}</span><span>{t.closes}</span>
      </div>
      <div className="p321-hours-days">{effective.days.map((day, index) =>
        <WeekdayRow key={day.weekday} day={day} index={index} locale={locale} idPrefix={idPrefix}
          disabled={inherited} error={errors[index]} onChange={update} />)}</div>
      <div className="p321-hours-actions">
        <div className="p321-hours-action-group">
          <button className="p321-save" type="submit" disabled={inherited || (!dirty && saved !== null)}>{t.save}</button>
          <button className="p321-outline" type="button" disabled={!dirty} onClick={discard}>{t.discard}</button>
          <button className="p321-outline" type="button" disabled={scope === "company" ? saved === null : inherited && saved === null}
            onClick={clear}>{scope === "company" ? t.clearCompany : t.clearOverride}</button>
        </div>
        <span className="p321-hours-preview">{t.preview}</span>
      </div>
    </form>
    {notice && <p className="p321-hours-notice" role="status">{notice}</p>}
  </section>;
}
