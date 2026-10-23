import { useEffect, useId, useRef, useState } from "react";
import { sampleSpecialProjection } from "../fixtures/simulated-data";
import type { PrototypeLocale } from "../types/variant";
import { HelpDialog } from "./HelpDialog";
import "./sla-full.css";

const copy = {
  en: {
    heading: "Location SLA target",
    detail: "Set the retrieval monitoring target for this Location in seconds.",
    label: "SLA target seconds",
    range: "Whole seconds from 30 to 3600.",
    current: "Saved Location value",
    notConfigured: "Not configured",
    valueUnit: "seconds",
    note: "Location-only setting. There is no Company SLA default to inherit.",
    save: "Save",
    clear: "Clear override",
    error: "Enter a whole number between 30 and 3600 seconds.",
    saved: "SLA target saved in this prototype's memory only.",
    cleared: "Location SLA target cleared in this prototype's memory only.",
    unsaved: "Unsaved change",
    readOnlyNotice: "Prototype interaction · No API request or actual setting change.",
  },
  ar: {
    heading: "هدف مستوى الخدمة للموقع",
    detail: "حدد هدف مراقبة وقت الاسترجاع لهذا الموقع بالثواني.",
    label: "هدف SLA بالثواني",
    range: "عدد صحيح من 30 إلى 3600 ثانية.",
    current: "القيمة المحفوظة للموقع",
    notConfigured: "غير مهيّأ",
    valueUnit: "ثانية",
    note: "إعداد خاص بالموقع؛ لا توجد قيمة SLA افتراضية للشركة لتوريثها.",
    save: "حفظ",
    clear: "إزالة التخصيص",
    error: "أدخل عددًا صحيحًا بين 30 و3600 ثانية.",
    saved: "تم حفظ هدف SLA في ذاكرة النموذج فقط.",
    cleared: "تمت إزالة هدف SLA من ذاكرة النموذج فقط.",
    unsaved: "تغيير غير محفوظ",
    readOnlyNotice: "تفاعل تجريبي · دون استدعاء API أو تغيير فعلي للإعدادات.",
  },
} as const;

interface Props {
  readonly locale: PrototypeLocale;
  readonly onDirtyChange?: (dirty: boolean) => void;
  readonly savedValue?: number | null;
  readonly onSavedValue?: (value: number | null) => void;
}

/** SLA is a nullable CA Location setting, never a Company default or inherited value. */
export function SlaFull({ locale, onDirtyChange, savedValue, onSavedValue }: Props) {
  const initialValue = savedValue === undefined ? sampleSpecialProjection.slaTargetSeconds : savedValue;
  const [value, setValue] = useState<number | null>(initialValue);
  const [draft, setDraft] = useState(initialValue === null ? "" : String(initialValue));
  const [touched, setTouched] = useState(false);
  const [feedback, setFeedback] = useState("");
  const onDirtyChangeRef = useRef(onDirtyChange);
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const t = copy[locale];
  onDirtyChangeRef.current = onDirtyChange;

  useEffect(() => {
    if (savedValue === undefined || savedValue === value) return;
    setValue(savedValue);
    setDraft(savedValue === null ? "" : String(savedValue));
    setTouched(false);
    setFeedback("");
  }, [savedValue, value]);

  const dirty = draft !== (value === null ? "" : String(value));
  const parsed = Number(draft);
  const valid = /^\d+$/.test(draft) && Number.isInteger(parsed) && parsed >= 30 && parsed <= 3600;
  const showError = touched && draft !== "" && !valid;

  useEffect(() => {
    onDirtyChangeRef.current?.(dirty);
  }, [dirty]);

  useEffect(() => () => {
    onDirtyChangeRef.current?.(false);
  }, []);

  function save() {
    if (!dirty || !valid) return;
    setValue(parsed);
    setTouched(false);
    setFeedback(t.saved);
    onSavedValue?.(parsed);
  }

  function clear() {
    if (value === null && draft === "") return;
    setValue(null);
    setDraft("");
    setTouched(false);
    setFeedback(t.cleared);
    onSavedValue?.(null);
  }

  return (
    <section className="p321-sla-full" aria-labelledby={`${fieldId}-heading`}>
      <div className="p321-sla-full-top">
        <div>
          <h3 id={`${fieldId}-heading`}>{t.heading}</h3>
          <p>{t.detail}</p>
        </div>
        {dirty && <span className="p321-sla-dirty">{t.unsaved}</span>}
      </div>

      <div className="p321-sla-value">
        <span>{t.current}</span>
        <strong>{value === null ? t.notConfigured : <><bdi dir="ltr">{value}</bdi> {t.valueUnit}</>}</strong>
      </div>

      <div className="p321-sla-full-form">
        <div className="p321-sla-input-area">
          <label htmlFor={fieldId}>{t.label}</label>
          <input id={fieldId} type="text" inputMode="numeric" autoComplete="off" pattern="[0-9]*"
            dir="ltr" value={draft} onBlur={() => setTouched(true)}
            placeholder={t.notConfigured} aria-invalid={showError}
            aria-describedby={`${hintId}${showError ? ` ${errorId}` : ""}`}
            onChange={(event) => {
              setDraft(event.target.value);
              setFeedback("");
            }} />
          <span className="p321-sla-hint" id={hintId}>{t.range}</span>
          {showError && <p className="p321-sla-error" id={errorId} role="alert">{t.error}</p>}
        </div>
        <div className="p321-sla-full-actions">
          <button className="p321-save" type="button" disabled={!dirty || !valid} onClick={save}>{t.save}</button>
          <HelpDialog helpKey="setting.slaTargetSeconds" locale={locale} />
          <button className="p321-outline" type="button" disabled={value === null && draft === ""}
            onClick={clear}>{t.clear}</button>
        </div>
      </div>

      <p className="p321-sla-full-note">{t.note}</p>
      <p className="p321-sla-full-disclaimer">{t.readOnlyNotice}</p>
      <div className="p321-sla-feedback" role="status" aria-live="polite">{feedback}</div>
    </section>
  );
}
