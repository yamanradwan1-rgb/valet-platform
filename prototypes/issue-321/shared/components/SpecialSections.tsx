import { useState } from "react";
import { presenceSettings, serviceStatusKeys } from "../fixtures/settings-catalog";
import { samplePresence, sampleWhatsApp } from "../fixtures/simulated-data";
import type { FixtureValue } from "../fixtures/settings-catalog";
import type { PrototypeLocale, PrototypeRole } from "../types/variant";
import { HelpDialog } from "./HelpDialog";

interface EditorProps {
  readonly locale: PrototypeLocale;
  readonly role: PrototypeRole;
  readonly hasLocation: boolean;
  readonly draft: Record<string, FixtureValue | "__INHERIT__">;
  readonly saved: Record<string, FixtureValue | "__INHERIT__">;
  readonly onChange: (key: string, value: FixtureValue | "__INHERIT__") => void;
  readonly onSave: (key: string) => void;
}

export function PresenceEditor(props: EditorProps) {
  const ar = props.locale === "ar";
  const [adminScope, setAdminScope] = useState<"company" | "location">("company");
  const scope = props.role === "COMPANY_ADMIN" ? (props.hasLocation ? adminScope : "company") : "location";
  return <div>
    {props.role === "COMPANY_ADMIN" && props.hasLocation && <div className="p321-presence-scope" role="group" aria-label={ar ? "نطاق حضور الورديات" : "Shift presence scope"}>
      <button type="button" aria-pressed={scope === "company"} onClick={() => setAdminScope("company")}>{ar ? "سياسة الشركة" : "Company policy"}</button>
      <button type="button" aria-pressed={scope === "location"} onClick={() => setAdminScope("location")}>{ar ? "استثناء الموقع" : "Location override"}</button>
    </div>}
    <div className="p321-setting-list">
    {presenceSettings.map(field => {
      const key = `presence:${scope}:${field.key}`;
      const fallback = scope === "company" ? samplePresence.company[field.key as keyof typeof samplePresence.company] : "__INHERIT__";
      const value = props.draft[key] ?? fallback;
      const dirty = value !== (props.saved[key] ?? fallback);
      return <div className="p321-setting-row" key={key}>
        <label className="p321-setting-caption" htmlFor={key}>{field.label[props.locale]}</label>
        <div className="p321-setting-edit">
          {"options" in field && field.options ?
            <select id={key} value={String(value)} onChange={e => props.onChange(key, e.target.value)}>
              {scope === "location" && <option value="__INHERIT__">{ar ? "وراثة إعداد الشركة" : "Inherit company"}</option>}
              {field.options.map(option => <option key={option} value={option}>{option}</option>)}
            </select> :
            <input id={key} type="number" min={"min" in field ? field.min : 1} max={"max" in field ? field.max : 200}
              value={value === "__INHERIT__" || value === null ? "" : String(value)}
              onChange={e => props.onChange(key, e.target.value === "" ? "" : Number(e.target.value))} />}
          {scope === "location" && !("options" in field && field.options) &&
            <button className="p321-inline-inherit" type="button" disabled={value === "__INHERIT__"} onClick={() => props.onChange(key, "__INHERIT__")}>{ar ? "وراثة الشركة" : "Inherit company"}</button>}
        </div>
        <div className="p321-row-actions"><button className="p321-save" disabled={!dirty} type="button" onClick={() => props.onSave(key)}>{ar ? "حفظ" : "Save"}</button>
          <HelpDialog helpKey={field.helpKey} locale={props.locale} /></div>
      </div>;
    })}
    <div className="p321-note">
      {ar ? "مناطق الحضور والجاهزية والاستثناءات: لا توجد بيانات خادم في هذا النموذج. يتم عرضها فقط عند جلبها من المصدر الحقيقي." : "Attendance zones, readiness and exceptions: no server data is available in this prototype. Real values require an authorized API read."}
      <HelpDialog helpKey="presence.readiness" locale={props.locale} />
      <HelpDialog helpKey="presence.zones" locale={props.locale} />
      <HelpDialog helpKey="presence.exceptions" locale={props.locale} />
    </div>
    </div>
  </div>;
}

export function ServiceStatus({ locale }: { readonly locale: PrototypeLocale }) {
  const labels = {
    PLATE_OCR: { en: "Plate OCR", ar: "قراءة اللوحات OCR" },
    STAFF_PUSH: { en: "Staff Push", ar: "إشعارات الموظفين" },
    DIGITAL_PAYMENT: { en: "Digital Payment", ar: "الدفع الرقمي" },
  } as const;
  return <div className="p321-service-grid">
    {serviceStatusKeys.map(key => <article className="p321-service-card" key={key}>
      <h3>{labels[key][locale]}</h3>
      <p>{locale === "ar" ? "الحالة غير معروفة — لم يتم استدعاء API." : "Status unknown — no API request was made."}</p>
      <HelpDialog helpKey="services.status" locale={locale} />
    </article>)}
  </div>;
}

export function WhatsAppExistingPlacement({ locale, scope }: { readonly locale: PrototypeLocale; readonly scope: "company" | "location" }) {
  const ar = locale === "ar";
  return <section className="p321-special-card" aria-label={ar ? "إعدادات واتساب الحالية" : "Existing WhatsApp settings"}>
    <div className="p321-special-head"><h3>{ar ? "إعدادات وصول الضيف عبر واتساب" : "WhatsApp Guest Access settings"}</h3>
      <span className="p321-tag">{scope === "company" ? (ar ? "الشركة" : "Company") : (ar ? "الموقع" : "Location")}</span></div>
    <p>{ar ? "هذا موضع إعدادات واتساب الحالي. المعاينة تجريبية، ولا يوجد ربط بمزود أو قوالب معتمدة في البيانات التجريبية." : "This is the existing WhatsApp settings context. The fixture has no provider binding or approved template versions."}</p>
    <div className="p321-inline-facts">
      <span>{ar ? "إرسال الرسائل الفعلي" : "Live sending"}: <strong>{sampleWhatsApp.globalSendEnabled ? "On" : (ar ? "معطل" : "Disabled")}</strong></span>
      <span>{ar ? "جاهزية التفعيل" : "Activation readiness"}: <strong>{sampleWhatsApp.activationReady ? "Ready" : (ar ? "غير متاحة" : "Unavailable")}</strong></span>
    </div>
  </section>;
}

export function OperatingHours({ locale, scope }: { readonly locale: PrototypeLocale; readonly scope: "company" | "location" }) {
  const [open, setOpen] = useState(false);
  const [edited, setEdited] = useState(false);
  const [saved, setSaved] = useState(false);
  const [days, setDays] = useState<boolean[]>(Array(7).fill(false));
  const labels = locale === "ar" ? ["الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"] :
    ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const ar = locale === "ar";
  return <section className="p321-special-card">
    <div className="p321-special-head"><h3>{ar ? "ساعات العمل" : "Operating hours"}</h3><HelpDialog helpKey="setting.operatingHours" locale={locale} /></div>
    <p>{saved ? (ar ? "جدول تجريبي محفوظ محليًا" : "Sample schedule saved in memory") : (ar ? "لا يوجد جدول أسبوعي محفوظ في البيانات التجريبية" : "No weekly schedule is configured in the fixture")}</p>
    <button className="p321-outline" type="button" onClick={() => setOpen(!open)}>{open ? (ar ? "إخفاء المحرر" : "Close editor") : (ar ? "تحرير جدول تجريبي" : "Edit sample schedule")}</button>
    {open && <div className="p321-hours-editor">
      {labels.map((day, index) => <label key={day}><input type="checkbox" checked={days[index]}
        onChange={e => { setEdited(true); setDays(old => old.map((v, i) => i === index ? e.target.checked : v)); }} />{day}</label>)}
      <p>{ar ? "أيام محددة مفتوحة ضمن المثال؛ ساعات الفتح والإغلاق الحقيقية تتطلب محرر الجدول المعتمد." : "Checked days are illustrative only; production opening/closing times use the existing schedule editor."}</p>
      <button className="p321-save" disabled={!edited} type="button" onClick={() => { setSaved(true); setEdited(false); setOpen(false); }}>{ar ? "حفظ المحاكاة" : "Save simulation"}</button>
    </div>}
    {scope === "location" && <small>{ar ? "إزالة الاستثناء تعيد وراثة ساعات الشركة" : "Clearing a Location override restores company hours"}</small>}
  </section>;
}
