import type { FixtureValue } from "../fixtures/settings-catalog";
import type { PolicySectionId, PrototypeLocale, PrototypeRole, PrototypeTheme } from "../types/variant";
import { HelpDialog } from "./HelpDialog";
import { SettingRows } from "./SettingRows";
import { OperatingHoursFull } from "./OperatingHoursFull";
import type { Schedule } from "./OperatingHoursFull";
import { ShiftPresenceFull } from "./ShiftPresenceFull";
import { ServiceStatusFull } from "./ServiceStatusFull";
import { SlaFull } from "./SlaFull";
import { WhatsAppFull } from "./WhatsAppFull";
import type { WhatsAppPrototypeSnapshot } from "./WhatsAppFull";
import type { Zone } from "./shift-presence-prototype-model";
import "./settings-pane.css";

interface Props {
  readonly section: PolicySectionId;
  readonly locale: PrototypeLocale;
  readonly theme: PrototypeTheme;
  readonly role: PrototypeRole;
  readonly hasLocation: boolean;
  readonly presenceCanEdit?: boolean;
  readonly presenceCanReviewExceptions?: boolean;
  readonly presentation: "classic" | "grouped" | "context" | "compact";
  readonly draft: Record<string, FixtureValue | "__INHERIT__">;
  readonly saved: Record<string, FixtureValue | "__INHERIT__">;
  readonly error: string | null;
  readonly onChange: (key: string, value: FixtureValue | "__INHERIT__") => void;
  readonly onSave: (key: string) => void;
  readonly onClear?: (key: string) => void;
  readonly onConflict: () => void;
  readonly onSelect: (section: PolicySectionId) => void;
  readonly onFeatureDirty?: (source: string, dirty: boolean) => void;
  readonly zones: readonly Zone[];
  readonly onZonesChange: (transform: (current: Zone[]) => Zone[]) => void;
  readonly slaSavedValue: number | null;
  readonly onSlaSavedValue: (value: number | null) => void;
  readonly hoursCompany: Schedule | null;
  readonly hoursLocation: Schedule | null;
  readonly onHoursSaved: (scope: "company" | "location", schedule: Schedule | null) => void;
  readonly whatsappSnapshot?: WhatsAppPrototypeSnapshot;
  readonly whatsappCompany?: WhatsAppPrototypeSnapshot;
  readonly onWhatsAppSnapshot: (scope: "company" | "location", value: WhatsAppPrototypeSnapshot) => void;
}

const texts = {
  company: { en: ["Company Defaults", "Starting values for authorized Locations."], ar: ["إعدادات الشركة الافتراضية", "القيم الأساسية التي يمكن للمواقع المخوّلة وراثتها."] },
  location: { en: ["Location Overrides", "Inspect inherited, overridden and effective settings."], ar: ["تخصيص إعدادات الموقع", "راجع القيم الموروثة والاستثناءات والقيم الفعلية."] },
  presence: { en: ["Shift Presence", "Point-in-time checks for shift start and end."], ar: ["حضور الورديات", "فحوص الحضور اللحظية لبدء الوردية وإنهائها."] },
  services: { en: ["Service Status", "Information only; no provider controls."], ar: ["حالة الخدمات", "للعرض فقط دون عناصر للتحكم بالمزود."] },
  overview: { en: ["Settings Overview", "How company defaults, location overrides and read-only information fit together."], ar: ["نظرة عامة على الإعدادات", "طريقة ارتباط قيم الشركة واستثناءات الموقع والمعلومات للقراءة فقط."] },
} as const;

export function SettingsPane(props: Props) {
  const ar = props.locale === "ar";
  const copy = texts[props.section][props.locale];
  const readOnly = props.section === "services" || props.section === "overview";
  const helpKey = props.section === "overview" ? "policies.page" : `policies.${props.section}`;
  return <section className={`p321-pane p321-pane-${props.presentation}`} aria-labelledby="p321-current-section" tabIndex={-1}>
    <div className="p321-pane-heading">
      <div><h2 id="p321-current-section" tabIndex={-1}>{copy[0]}</h2><p>{copy[1]}</p></div>
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
          draft={props.draft} saved={props.saved} onChange={props.onChange} onSave={props.onSave} onClear={props.onClear}
          compact={props.presentation === "compact"} />
        {props.role === "COMPANY_ADMIN" && <OperatingHoursFull locale={props.locale} scope={props.section}
          savedCompany={props.hoursCompany} savedLocation={props.hoursLocation} onSavedSchedule={props.onHoursSaved}
          onDirtyChange={dirty => props.onFeatureDirty?.("operating-hours", dirty)} />}
        {props.section === "location" && props.role === "COMPANY_ADMIN" &&
          <SlaFull locale={props.locale} savedValue={props.slaSavedValue} onSavedValue={props.onSlaSavedValue}
            onDirtyChange={dirty => props.onFeatureDirty?.("sla", dirty)} />}
        {props.role === "COMPANY_ADMIN" && <WhatsAppFull locale={props.locale} scope={props.section}
          snapshot={props.whatsappSnapshot} companySaved={props.whatsappCompany?.saved}
          onSnapshotChange={snapshot => props.onWhatsAppSnapshot(props.section as "company" | "location", snapshot)}
          onDirtyChange={dirty => props.onFeatureDirty?.("whatsapp", dirty)} />}
        <button type="button" className="p321-simulate" onClick={props.onConflict}>{ar ? "محاكاة تعارض إصدار (409)" : "Simulate revision conflict (409)"}</button>
      </>}
    </>}
    {props.section === "presence" && (props.role === "COMPANY_ADMIN" || props.hasLocation) &&
      <ShiftPresenceFull locale={props.locale} theme={props.theme} role={props.role} hasLocation={props.hasLocation}
        canEdit={props.presenceCanEdit !== false} canReviewExceptions={props.presenceCanReviewExceptions !== false}
        zones={props.zones} onZonesChange={props.onZonesChange}
        draft={props.draft} saved={props.saved} onChange={props.onChange} onSave={props.onSave}
        onDirtyChange={dirty => props.onFeatureDirty?.("presence-zone", dirty)} />}
    {props.section === "services" && <ServiceStatusFull locale={props.locale} />}
  </section>;
}
