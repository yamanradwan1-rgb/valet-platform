import { useRef, useState } from "react";
import { ShiftPresenceMapFirstLayout } from "../../../../apps/dashboard/src/features/administration/settings/shift-presence-map-first-layout";
import { presenceSettings, type FixtureValue } from "../fixtures/settings-catalog";
import { samplePresence } from "../fixtures/simulated-data";
import type { PrototypeLocale, PrototypeRole, PrototypeTheme } from "../types/variant";
import { HelpDialog } from "./HelpDialog";
import { PresenceExceptionsPreview } from "./PresenceExceptionsPreview";
import { PrototypeMap } from "./shift-presence-prototype-map";
import { ZoneDialog } from "./shift-presence-zone-dialog";
import { blank, phrase, type Zone, type ZoneFields } from "./shift-presence-prototype-model";
import "./shift-presence-full.css";

type View = "overview" | "zones" | "policy" | "exceptions" | "setup";
type Scope = "company" | "location";
type Value = FixtureValue | "__INHERIT__";

interface Props {
  readonly locale: PrototypeLocale;
  readonly theme: PrototypeTheme;
  readonly role: PrototypeRole;
  readonly hasLocation: boolean;
  readonly canEdit: boolean;
  readonly canReviewExceptions: boolean;
  readonly draft: Record<string, Value>;
  readonly saved: Record<string, Value>;
  readonly onChange: (key: string, value: Value) => void;
  readonly onSave: (key: string) => void;
  readonly onDirtyChange?: (dirty: boolean) => void;
  readonly zones: readonly Zone[];
  readonly onZonesChange: (transform: (current: Zone[]) => Zone[]) => void;
}

const modes = {
  OFF: { en: "Off", ar: "إيقاف" },
  WARN_ONLY: { en: "Warn only", ar: "تنبيه فقط" },
  REQUIRE: { en: "Require", ar: "مطلوب" },
  REQUIRE_OR_OVERRIDE: { en: "Require or override", ar: "مطلوب أو موافقة" },
} as const;
export function ShiftPresenceFull(props: Props) {
  const { locale, role, hasLocation } = props;
  const [view, setView] = useState<View>("overview");
  const [scope, setScope] = useState<Scope>("location");
  const zones = props.zones;
  const setZones = props.onZonesChange;
  const [editing, setEditing] = useState<Zone | "new" | null>(null);
  const zoneOpener = useRef<HTMLButtonElement | null>(null);
  const [zoneDirty, setZoneDirty] = useState(false);
  const [step, setStep] = useState(0);
  const [notice, setNotice] = useState("");
  const selectedScope: Scope = role === "LOCATION_MANAGER" ? "location" : !hasLocation ? "company" : scope;
  const label = (en: string, ar: string) => phrase(locale, en, ar);
  const policyKeys = presenceSettings.map(field => `presence:${selectedScope}:${field.key}`);
  const dirtyPolicy = policyKeys.some(key => props.draft[key] !== props.saved[key]);
  const activeZones = zones.filter(z => z.state === "ACTIVE");
  const canEditZones = hasLocation && props.canEdit;
  const fieldsFor = (zone: Zone | null): ZoneFields => zone ? {
    label: zone.label, code: zone.code, latitude: String(zone.lat), longitude: String(zone.lng),
    radiusMeters: String(zone.radiusMeters), state: zone.state,
  } : blank;
  const chooseView = (next: View) => {
    if (zoneDirty && !window.confirm(label("Discard unsaved zone changes?", "تجاهل تغييرات المنطقة غير المحفوظة؟"))) return;
    setView(next);
    if (next === "setup") setStep(0);
  };
  const policy = <div className="p321-presence-policy">
    <div className="p321-special-head"><h3>{label("Start / end shift policy", "سياسة بدء الوردية وإنهائها")}</h3><HelpDialog helpKey="presence.review" locale={locale} /></div>
    {role === "COMPANY_ADMIN" && hasLocation && <div className="p321-presence-scope" role="group" aria-label={label("Policy scope", "نطاق السياسة")}>
      <button type="button" aria-pressed={selectedScope === "company"} onClick={() => setScope("company")}>{label("Company defaults", "قيم الشركة الافتراضية")}</button>
      <button type="button" aria-pressed={selectedScope === "location"} onClick={() => setScope("location")}>{label("Location overrides", "تخصيص الموقع")}</button>
    </div>}
    <p className="p321-zone-hint">{selectedScope === "company" ? label(
      "Company defaults supply the baseline for Locations without overrides. Zones are configured at Location scope.",
      "قيم الشركة الأساسية تُورث للمواقع دون تخصيص. تُضبط مناطق الحضور ضمن الموقع.") : label(
      "The selected Location may inherit Company policy or explicitly override each field.",
      "يمكن للموقع المحدد وراثة سياسة الشركة أو تخصيص كل حقل بشكل مستقل.")}</p>
    <div className="p321-setting-list">{presenceSettings.map(field => {
      const key = `presence:${selectedScope}:${field.key}`;
      const fallback: Value = selectedScope === "company" ? samplePresence.company[field.key as keyof typeof samplePresence.company] : "__INHERIT__";
      const value = props.draft[key] ?? fallback;
      const saved = props.saved[key] ?? fallback;
      const invalid = value !== "__INHERIT__" && (value === "" || typeof value === "number" &&
        (!Number.isInteger(value) || value < 1 || (field.key.endsWith("Meters") ? value > 200 : value > 120)));
      const dirty = value !== saved;
      const companySaved = props.saved[`presence:company:${field.key}`] ?? samplePresence.company[field.key as keyof typeof samplePresence.company];
      const savedEffective = saved === "__INHERIT__" ? companySaved : saved;
      const draftEffective = value === "__INHERIT__" ? companySaved : value;
      return <div className="p321-setting-row" key={key}>
        <label className="p321-setting-caption" htmlFor={`p321-${key}`}>{field.label[locale]}</label>
        <div className="p321-setting-edit">
          {"options" in field && field.options ? <select id={`p321-${key}`} value={String(value)} disabled={!props.canEdit} onChange={e => props.onChange(key, e.target.value)}>
            {selectedScope === "location" && <option value="__INHERIT__">{label("Inherit Company", "وراثة إعداد الشركة")}</option>}
            {field.options.map(option => <option key={option} value={option}>{modes[option as keyof typeof modes]?.[locale] ?? option}</option>)}
          </select> : <input id={`p321-${key}`} type="number" min="1" max={field.key.endsWith("Meters") ? "200" : "120"}
            value={value === "__INHERIT__" || value === null ? "" : String(value)} disabled={!props.canEdit || value === "__INHERIT__"}
            onChange={e => props.onChange(key, e.target.value === "" ? "" : Number(e.target.value))} />}
          {selectedScope === "location" && <button className="p321-inline-inherit" type="button" disabled={!props.canEdit}
            onClick={() => props.onChange(key, value === "__INHERIT__" ? companySaved : "__INHERIT__")}>
              {value === "__INHERIT__" ? label("Customize", "تخصيص") : label("Inherit Company", "وراثة الشركة")}</button>}
          {selectedScope === "location" && <><small className="p321-effective-value">{label("Saved effective", "القيمة المحفوظة الفعلية")}: {String(savedEffective)}</small>
            <small className="p321-effective-value">{label("Draft preview", "معاينة المسودة")}: {String(draftEffective)}</small></>}
          {invalid && <small className="p321-error">{label("Enter a valid integer in range.", "أدخل عددًا صحيحًا ضمن المجال.")}</small>}
        </div>
        <div className="p321-row-actions"><button className="p321-save" type="button" disabled={!props.canEdit || !dirty || invalid}
          onClick={() => {
            if ((field.key.includes("Mode")) && (value === "REQUIRE" || value === "REQUIRE_OR_OVERRIDE") &&
              !window.confirm(label("Strict mode requires server readiness and explicit confirmation. Save simulation?", "يتطلب الوضع الإلزامي جاهزية الخادم وتأكيدًا صريحًا. حفظ المحاكاة؟"))) return;
            props.onSave(key);
          }}>{label("Save", "حفظ")}</button><HelpDialog locale={locale} helpKey={field.helpKey} /></div>
      </div>;
    })}</div>
    {dirtyPolicy && <p className="p321-zone-hint" role="status">{label("Unsaved policy drafts exist. Each row saves independently.", "توجد تغييرات سياسة غير محفوظة. يُحفظ كل صف بشكل مستقل.")}</p>}
  </div>;
  const zoneContent = <div className="p321-presence-zones">
    <div className="p321-special-head"><div><h3>{label("Attendance zones", "مناطق الحضور")}</h3>
      <p>{label("Exact Location · saved simulation zones only", "الموقع المحدد · مناطق المحاكاة المحفوظة فقط")}</p></div>
      <div className="p321-pane-tools"><HelpDialog helpKey="presence.zones" locale={locale} />
        {canEditZones && <button type="button" className="p321-save" onClick={event => { zoneOpener.current = event.currentTarget; setEditing("new"); }}>{label("Add zone", "إضافة منطقة")}</button>}</div></div>
    <PrototypeMap locale={locale} theme={props.theme} zones={zones} />
    {notice && <p role="status" className="p321-zone-hint">{notice}</p>}
    {!hasLocation ? <p className="p321-empty">{label("Select an authorized Location to configure zones.", "اختر موقعًا مخولًا لإعداد المناطق.")}</p> :
      zones.length === 0 ? <div className="p321-empty" role="status">{label(
        canEditZones ? "No zones saved in the prototype. Choose Add zone, then use the map, coordinates or current location." : "No sample zones; this simulated capability cannot edit attendance zones.",
        canEditZones ? "لا توجد مناطق محفوظة. اختر إضافة منطقة ثم استخدم الخريطة أو الإحداثيات أو موقعك الحالي." : "لا توجد مناطق تجريبية؛ هذه الصلاحية لا تسمح بتعديل مناطق الحضور.")}</div> :
      <div className="p321-zones-table-wrap" role="region" aria-label={label("Saved zones", "المناطق المحفوظة")} tabIndex={0}>
        <table className="p321-zones-table"><thead><tr>{[
          label("Label", "الاسم"), label("Code", "الرمز"), label("Status", "الحالة"), label("Radius", "نصف القطر"),
          label("Latitude", "خط العرض"), label("Longitude", "خط الطول"), label("Revision", "المراجعة"), label("Actions", "الإجراءات"),
        ].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{zones.map(zone => <tr key={zone.id}>
          <td>{zone.label}</td><td><bdi>{zone.code}</bdi></td><td>{zone.state === "ACTIVE" ? label("Active", "نشطة") : label("Disabled", "معطّلة")}</td>
          <td>{zone.radiusMeters} m</td><td><bdi>{zone.lat}</bdi></td><td><bdi>{zone.lng}</bdi></td><td>{zone.revision}</td><td>
            <div className="p321-zones-actions"><button type="button" className="p321-outline" disabled={!canEditZones} onClick={event => { zoneOpener.current = event.currentTarget; setEditing(zone); }}>{label("Edit", "تعديل")}</button>
              <button type="button" className="p321-outline" disabled={!canEditZones} onClick={() => {
                if (!window.confirm(label("Confirm zone status change in simulation?", "تأكيد تغيير حالة المنطقة في المحاكاة؟"))) return;
                setZones(old => old.map(z => z.id === zone.id ? { ...z, state: z.state === "ACTIVE" ? "DISABLED" : "ACTIVE", revision: z.revision + 1 } : z));
              }}>{zone.state === "ACTIVE" ? label("Disable", "تعطيل") : label("Enable", "تفعيل")}</button></div></td>
        </tr>)}</tbody></table>
      </div>}
  </div>;
  const readiness = <div className="p321-presence-summary">
    <div className="p321-special-head"><h3>{label("Configuration & readiness", "الإعدادات والجاهزية")}</h3><HelpDialog helpKey="presence.readiness" locale={locale} /></div>
    <p><strong>{label("Server readiness", "جاهزية الخادم")}:</strong> {label("Unknown (no API call)", "غير معروفة (دون اتصال API)")}</p>
    <p><strong>{label("Demo saved active zones", "المناطق التجريبية النشطة")}:</strong> {activeZones.length}</p>
    <p>{label("Start policy draft preview", "معاينة مسودة سياسة البدء")}: {String(props.draft["presence:location:shiftStartPresenceMode"] === "__INHERIT__" ?
      props.draft["presence:company:shiftStartPresenceMode"] : props.draft["presence:location:shiftStartPresenceMode"])}</p>
    <p>{label("End policy draft preview", "معاينة مسودة سياسة الإنهاء")}: {String(props.draft["presence:location:shiftEndPresenceMode"] === "__INHERIT__" ?
      props.draft["presence:company:shiftEndPresenceMode"] : props.draft["presence:location:shiftEndPresenceMode"])}</p>
    <p>{label("Strict activation is determined only by the real server. These sample zones do not establish readiness.", "الخادم الحقيقي وحده يحدد جاهزية التفعيل الإلزامي. المناطق التجريبية لا تثبت الجاهزية.")}</p>
    <button type="button" className="p321-outline" onClick={() => chooseView("policy")}>{label("Review shift policy", "مراجعة سياسة الورديات")}</button>
  </div>;
  const exceptions = <PresenceExceptionsPreview locale={locale} canReview={props.canReviewExceptions} />;
  const setup = <div className="p321-presence-panel">
    <div className="p321-special-head"><h3>{label("Guided setup", "الإعداد الموجّه")}</h3><HelpDialog helpKey="presence.review" locale={locale} /></div>
    <div className="p321-presence-steps" role="group" aria-label={label("Setup steps", "خطوات الإعداد")}>
      {[label("1. Scope", "١. النطاق"), label("2. Zones", "٢. المناطق"), label("3. Policy", "٣. السياسة"),
        label("4. Review", "٤. المراجعة")].map((name, i) =>
        <button type="button" key={i} aria-pressed={step === i} onClick={() => setStep(i)}>{name}</button>)}
    </div>
    {step === 0 ? <div><h4>{label("Confirm exact Location", "تأكيد الموقع المحدد")}</h4>
      <p>{label("Company: simulated Acme Valet · Location: simulated Main Garage. Company defaults apply to policy only. Presence is checked at Start and End; there is no continuous tracking.",
        "الشركة التجريبية: Acme Valet · الموقع التجريبي: Main Garage. القيم الافتراضية للشركة للسياسة فقط. يجري فحص الحضور عند البدء والإنهاء دون تتبّع مستمر.")}</p></div> :
      step === 1 ? <div><p>{label("Save every attendance zone independently before proposing strict mode.", "احفظ كل منطقة حضور مستقلة قبل اقتراح السياسة الإلزامية.")}</p>
        {zoneContent}</div> : step === 2 ? <div><p>{label("Save Start, End, accuracy and fix-age independently.", "احفظ البدء والإنهاء والدقة وعمر الموقع بشكل مستقل.")}</p>{readiness}{policy}</div> :
        <div><h4>{label("Review simulated saved state", "مراجعة الحالة التجريبية المحفوظة")}</h4>
          {readiness}<p>{label("This is not server confirmation. Any production activation needs authoritative readiness and authorization.", "هذه ليست مصادقة من الخادم؛ التفعيل الإنتاجي يتطلب جاهزية وصلاحيات معتمدة.")}</p>
          <button type="button" className="p321-outline" onClick={() => chooseView("overview")}>{label("Return to overview", "العودة للنظرة العامة")}</button></div>}
    <div className="p321-presence-step-actions"><button type="button" className="p321-outline" disabled={step === 0} onClick={() => setStep(i => i - 1)}>{label("Previous", "السابق")}</button>
      <button type="button" className="p321-save" disabled={step === 3} onClick={() => setStep(i => i + 1)}>{label("Next", "التالي")}</button></div>
  </div>;
  return <div className="p321-presence-full">
    <ShiftPresenceMapFirstLayout locale={locale} heading={<div className="p321-presence-heading">
      <p>{label("Point-in-time location checks at shift Start and End. All data and saves shown here are simulated.", "تحقق لحظي من الموقع عند بدء المناوبة وإنهائها. جميع البيانات وعمليات الحفظ هنا تجريبية.")}</p>
      <span className="p321-tag">{selectedScope === "company" ? label("Company policy", "سياسة الشركة") : label("Selected Location", "الموقع المحدد")}</span>
    </div>}
      overview={readiness} zones={hasLocation ? zoneContent : <div className="p321-presence-panel">{label("Choose an authorized Location for zone management.", "اختر موقعًا مخولًا لإدارة المناطق.")}</div>}
      policy={policy} exceptions={hasLocation ? exceptions : <div className="p321-empty">{label("Choose a Location to inspect exceptions.", "اختر موقعًا لعرض الاستثناءات.")}</div>}
      setup={hasLocation ? setup : <div className="p321-empty">{label("Select a Location before guided setup.", "اختر موقعًا قبل الإعداد الموجّه.")}</div>}
      activeView={view} onView={chooseView} />
    {editing && <ZoneDialog locale={locale} theme={props.theme} initial={fieldsFor(editing === "new" ? null : editing)}
      zone={editing === "new" ? null : editing} zones={zones} onDirtyChange={dirty => { setZoneDirty(dirty); props.onDirtyChange?.(dirty); }}
      onClose={() => { setZoneDirty(false); props.onDirtyChange?.(false); setEditing(null);
        requestAnimationFrame(() => zoneOpener.current?.focus({ preventScroll: true })); }}
      onSave={value => {
        setZones(old => editing === "new" ?
          [...old, { ...value, id: `sample-zone-${old.length + 1}`, revision: 1 }] :
          old.map(z => z.id === editing.id ? { ...z, ...value, revision: z.revision + 1 } : z));
        setZoneDirty(false); props.onDirtyChange?.(false); setEditing(null);
        requestAnimationFrame(() => zoneOpener.current?.focus({ preventScroll: true }));
        setNotice(label("Zone saved in prototype memory only.", "تم حفظ المنطقة في ذاكرة النموذج فقط."));
      }} />}
  </div>;
}
