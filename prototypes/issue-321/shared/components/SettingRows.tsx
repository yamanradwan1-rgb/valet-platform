import { useState } from "react";
import { ordinarySettings } from "../fixtures/settings-catalog";
import { sampleCompanyDefaults } from "../fixtures/simulated-data";
import type { FixtureValue } from "../fixtures/settings-catalog";
import type { PrototypeLocale, PrototypeRole } from "../types/variant";
import { HelpDialog } from "./HelpDialog";

const optionLabels: Record<string, { en: string; ar: string }> = {
  PICKUP_CODE: { en: "Pickup code", ar: "رمز الاستلام" },
  DYNAMIC_QR: { en: "Dynamic QR", ar: "رمز QR ديناميكي" },
  EITHER: { en: "Either method", ar: "أي من الطريقتين" },
  CUSTOMER: { en: "Customer", ar: "العميل" }, VENUE: { en: "Venue", ar: "المنشأة" },
  CASH_ONLY: { en: "Cash only", ar: "نقدًا فقط" },
  DIGITAL_ONLY: { en: "Digital only", ar: "رقمي فقط" },
  CASH_OR_DIGITAL: { en: "Cash or digital", ar: "نقدي أو رقمي" },
  EN: { en: "English", ar: "الإنجليزية" }, AR: { en: "Arabic", ar: "العربية" },
};

interface Props {
  readonly scope: "company" | "location";
  readonly locale: PrototypeLocale;
  readonly role: PrototypeRole;
  readonly draft: Record<string, FixtureValue | "__INHERIT__">;
  readonly saved: Record<string, FixtureValue | "__INHERIT__">;
  readonly onChange: (key: string, value: FixtureValue | "__INHERIT__") => void;
  readonly onSave: (key: string) => void;
  readonly compact?: boolean;
}

function valueLabel(value: FixtureValue | "__INHERIT__" | undefined, locale: PrototypeLocale) {
  if (value === "__INHERIT__" || value === null || value === undefined) return locale === "ar" ? "يورث من الشركة" : "Inherit company";
  if (typeof value === "boolean") return value ? (locale === "ar" ? "نعم" : "Yes") : (locale === "ar" ? "لا" : "No");
  return optionLabels[String(value)]?.[locale] ?? String(value);
}

export function SettingRows({ scope, locale, role, draft, saved, onChange, onSave, compact }: Props) {
  const [showAll, setShowAll] = useState(false);
  const ar = locale === "ar";
  const fields = ordinarySettings.filter(field => scope === "company" || role === "COMPANY_ADMIN" || field.locationManager);
  const shown = showAll ? fields : fields.slice(0, compact ? 7 : 5);

  return <div className="p321-setting-list">
    {shown.map(field => {
      const stateKey = `${scope}:${field.key}`;
      const placeholder = scope === "location" ? "__INHERIT__" : null;
      const value = draft[stateKey] ?? placeholder;
      const isDirty = value !== (saved[stateKey] ?? placeholder);
      return <div className="p321-setting-row" key={field.key}>
        <div className="p321-setting-caption">
          <label htmlFor={`field-${stateKey}`}>{field.label[locale]}</label>
          {scope === "location" && <small>{ar ? "الافتراضي: " : "Company default: "}{valueLabel(sampleCompanyDefaults[field.key], locale)}</small>}
        </div>
        <div className="p321-setting-edit">
          {field.kind === "integer" || field.kind === "money" ?
            <input id={`field-${stateKey}`} type="number" inputMode="decimal"
              min="0" step={field.kind === "money" ? "0.001" : "1"}
              value={value === "__INHERIT__" || value === null ? "" : String(value)}
              placeholder={scope === "location" ? (ar ? "موروث" : "Inherited") : "0"}
              onChange={e => onChange(stateKey, e.target.value)} /> :
            <select id={`field-${stateKey}`} value={String(value)}
              onChange={e => onChange(stateKey, e.target.value === "true" ? true : e.target.value === "false" ? false : e.target.value)}>
              {scope === "location" && <option value="__INHERIT__">{ar ? "وراثة قيمة الشركة" : "Inherit company"}</option>}
              {field.kind === "boolean" ? <>
                <option value="true">{ar ? "نعم" : "Yes"}</option>
                <option value="false">{ar ? "لا" : "No"}</option>
              </> : field.options?.map(option => <option value={option} key={option}>{optionLabels[option]?.[locale] ?? option}</option>)}
            </select>}
          {scope === "location" && (field.kind === "integer" || field.kind === "money") &&
            <button className="p321-inline-inherit" type="button" disabled={value === "__INHERIT__"}
              onClick={() => onChange(stateKey, "__INHERIT__")}>{ar ? "وراثة قيمة الشركة" : "Inherit company"}</button>}
          <span className="p321-effective-value">{ar ? "معاينة المسودة: " : "Draft preview: "}{valueLabel(value, locale)}</span>
        </div>
        <div className="p321-row-actions">
          <button className="p321-save" disabled={!isDirty} type="button" onClick={() => onSave(stateKey)}>{ar ? "حفظ" : "Save"}</button>
          <HelpDialog helpKey={field.helpKey} locale={locale} fallback={field.label[locale]} />
        </div>
      </div>;
    })}
    {fields.length > shown.length && <button className="p321-expand" type="button" onClick={() => setShowAll(true)}>
      {ar ? `إظهار كل الإعدادات (${fields.length})` : `Show all settings (${fields.length})`}
    </button>}
    {showAll && fields.length > (compact ? 7 : 5) && <button className="p321-expand" type="button" onClick={() => setShowAll(false)}>
      {ar ? "إظهار عدد أقل" : "Show fewer"}
    </button>}
  </div>;
}
