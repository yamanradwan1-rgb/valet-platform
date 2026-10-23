import { useState } from "react";
import type { FixtureValue } from "../fixtures/settings-catalog";
import type { PolicySectionId, PrototypeLocale, PrototypeRole } from "../types/variant";
import { HelpDialog } from "./HelpDialog";
import { SettingRows } from "./SettingRows";
import { OperatingHours, PresenceEditor, ServiceStatus, WhatsAppExistingPlacement } from "./SpecialSections";
import "./settings-pane.css";

interface Props {
  readonly section: PolicySectionId;
  readonly locale: PrototypeLocale;
  readonly role: PrototypeRole;
  readonly hasLocation: boolean;
  readonly presentation: "classic" | "grouped" | "context" | "compact";
  readonly draft: Record<string, FixtureValue | "__INHERIT__">;
  readonly saved: Record<string, FixtureValue | "__INHERIT__">;
  readonly error: string | null;
  readonly onChange: (key: string, value: FixtureValue | "__INHERIT__") => void;
  readonly onSave: (key: string) => void;
  readonly onConflict: () => void;
  readonly onSelect: (section: PolicySectionId) => void;
}

const texts = {
  company: { en: ["Company Defaults", "Starting values for authorized Locations."], ar: ["إعدادات الشركة الافتراضية", "القيم الأساسية التي يمكن للمواقع المخوّلة وراثتها."] },
  location: { en: ["Location Overrides", "Inspect inherited, overridden and effective settings."], ar: ["تخصيص إعدادات الموقع", "راجع القيم الموروثة والاستثناءات والقيم الفعلية."] },
  presence: { en: ["Shift Presence", "Point-in-time checks for shift start and end."], ar: ["حضور الورديات", "فحوص الحضور اللحظية لبدء الوردية وإنهائها."] },
  services: { en: ["Service Status", "Information only; no provider controls."], ar: ["حالة الخدمات", "للعرض فقط دون عناصر للتحكم بالمزود."] },
  overview: { en: ["Settings Overview", "How company defaults, location overrides and read-only information fit together."], ar: ["نظرة عامة على الإعدادات", "طريقة ارتباط قيم الشركة واستثناءات الموقع والمعلومات للقراءة فقط."] },
} as const;

export function SettingsPane(props: Props) {
  const [slaDraft, setSlaDraft] = useState("");
  const [slaSaved, setSlaSaved] = useState("");
  const ar = props.locale === "ar";
  const copy = texts[props.section][props.locale];
  const readOnly = props.section === "services" || props.section === "overview";
  const helpKey = props.section === "overview" ? "policies.page" : `policies.${props.section}`;
  return <section className={`p321-pane p321-pane-${props.presentation}`} aria-labelledby="p321-current-section" tabIndex={-1}>
    <div className="p321-pane-heading">
      <div><h2 id="p321-current-section">{copy[0]}</h2><p>{copy[1]}</p></div>
      <div className="p321-pane-tools">{readOnly && <span className="p321-tag">{ar ? "قراءة فقط" : "Read only"}</span>}
        <HelpDialog helpKey={helpKey} locale={props.locale} fallback={copy[0]} />
      </div>
    </div>
    {props.error && <div className="p321-error" role="alert">{props.error}</div>}
    {props.section === "overview" && <div className="p321-overview-grid">
      <article><h3>{ar ? "قيم الشركة" : "Company defaults"}</h3><p>{ar ? "تُحفظ كل سياسة بصورة صريحة، ثم يمكن توريثها في الموقع." : "Each policy has an explicit Save; Locations may inherit it."}</p>
        {props.role === "COMPANY_ADMIN" && <button onClick={() => props.onSelect("company")} type="button">{ar ? "فتح قيم الشركة" : "Open company defaults"}</button>}</article>
      <article><h3>{ar ? "استثناءات الموقع" : "Location overrides"}</h3><p>{ar ? "القيمة الفعلية قد تأتي من الشركة أو استثناء موقع مخوّل." : "The effective value comes from the default or an authorized override."}</p>
        <button onClick={() => props.onSelect("location")} type="button">{ar ? "فتح استثناءات الموقع" : "Open location overrides"}</button></article>
      <article><h3>{ar ? "حضور الورديات" : "Shift presence"}</h3><p>{ar ? "سياسات لحظية منفصلة عن تتبع المركبات." : "Point-in-time checks, separate from vehicle tracking."}</p>
        <button onClick={() => props.onSelect("presence")} type="button">{ar ? "فتح حضور الورديات" : "Open shift presence"}</button></article>
    </div>}
    {(props.section === "company" || props.section === "location") && <>
      {props.section === "location" && !props.hasLocation ? <div className="p321-empty" role="status">
        {ar ? "اختر موقعًا مخوّلًا حتى تظهر استثناءات الإعدادات. لا توجد قيم حقيقية في النموذج." : "Choose an authorized Location to inspect overrides. This prototype has no live values."}
      </div> : <>
        <SettingRows scope={props.section} locale={props.locale} role={props.role}
          draft={props.draft} saved={props.saved} onChange={props.onChange} onSave={props.onSave}
          compact={props.presentation === "compact"} />
        {props.role === "COMPANY_ADMIN" && <OperatingHours locale={props.locale} scope={props.section} />}
        {props.section === "location" && props.role === "COMPANY_ADMIN" && <section className="p321-special-card">
          <div className="p321-special-head"><h3>{ar ? "هدف SLA بالثواني" : "SLA target seconds"}</h3><HelpDialog helpKey="setting.slaTargetSeconds" locale={props.locale} /></div>
          <p>{ar ? "خاص بالموقع ولا يرث قيمة من الشركة. المجال 30–3600." : "Location-only; no Company default. Valid range 30–3600 seconds."}</p>
          <div className="p321-sla-editor"><input aria-label={ar ? "هدف SLA بالثواني" : "SLA target seconds"} type="number" min="30" max="3600"
            value={slaDraft} placeholder={ar ? "غير مهيأ" : "Not configured"} onChange={e => setSlaDraft(e.target.value)} />
            <button type="button" className="p321-save" disabled={slaDraft === slaSaved || (slaDraft !== "" && (Number(slaDraft) < 30 || Number(slaDraft) > 3600))}
              onClick={() => setSlaSaved(slaDraft)}>{ar ? "حفظ" : "Save"}</button>
            <button type="button" className="p321-outline" onClick={() => { setSlaDraft(""); setSlaSaved(""); }}>{ar ? "إزالة" : "Clear"}</button></div>
          {slaDraft !== "" && (Number(slaDraft) < 30 || Number(slaDraft) > 3600) && <p className="p321-error" role="alert">{ar ? "القيمة خارج المجال المسموح" : "Value must be between 30 and 3600"}</p>}
        </section>}
        {props.role === "COMPANY_ADMIN" && <WhatsAppExistingPlacement locale={props.locale} scope={props.section} />}
        <button type="button" className="p321-simulate" onClick={props.onConflict}>{ar ? "محاكاة تعارض إصدار (409)" : "Simulate revision conflict (409)"}</button>
      </>}
    </>}
    {props.section === "presence" && (props.role === "COMPANY_ADMIN" || props.hasLocation) &&
      <PresenceEditor locale={props.locale} role={props.role} hasLocation={props.hasLocation} draft={props.draft} saved={props.saved} onChange={props.onChange} onSave={props.onSave} />}
    {props.section === "services" && <ServiceStatus locale={props.locale} />}
  </section>;
}
