import { useEffect, useRef, useState } from "react";
import { suggestZoneCode } from "../../../../apps/dashboard/src/features/administration/settings/shift-presence-zone-code";
import type { PrototypeLocale, PrototypeTheme } from "../types/variant";
import { HelpDialog } from "./HelpDialog";
import { PrototypeMap } from "./shift-presence-prototype-map";
import { phrase, type Zone, type ZoneFields } from "./shift-presence-prototype-model";

function parseZone(fields: ZoneFields, zones: readonly Zone[], excludeId: string | null) {
  const lat = Number(fields.latitude);
  const lng = Number(fields.longitude);
  const radius = Number(fields.radiusMeters);
  if (!fields.label.trim() || fields.label.length > 200 || !fields.code.trim() || fields.code.length > 64 ||
      zones.some(z => z.id !== excludeId && z.code.toLowerCase() === fields.code.trim().toLowerCase()) ||
      !fields.latitude.trim() || !fields.longitude.trim() || !fields.radiusMeters.trim() ||
      !Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180 ||
      !Number.isFinite(radius) || radius < 5 || radius > 1000) return null;
  return { label: fields.label.trim(), code: fields.code.trim(), lat, lng, radiusMeters: radius, state: fields.state };
}

export function ZoneDialog({ locale, theme, initial, zone, zones, onSave, onClose, onDirtyChange }: {
  locale: PrototypeLocale; theme: PrototypeTheme; initial: ZoneFields; zone: Zone | null; zones: readonly Zone[];
  onSave: (value: ReturnType<typeof parseZone> & object) => void; onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [fields, setFields] = useState(initial);
  const [touched, setTouched] = useState(false);
  const [locationStatus, setLocationStatus] = useState("");
  const locateToken = useRef(0);
  const codeTouched = useRef(Boolean(zone));
  const dirtyReporter = useRef(onDirtyChange);
  dirtyReporter.current = onDirtyChange;
  const parsed = parseZone(fields, zones, zone?.id ?? null);
  const dirty = JSON.stringify(fields) !== JSON.stringify(initial);
  useEffect(() => {
    dialog.current?.showModal();
    return () => { locateToken.current++; dialog.current?.close(); };
  }, []);
  useEffect(() => { dirtyReporter.current?.(dirty); }, [dirty]);
  useEffect(() => () => { dirtyReporter.current?.(false); }, []);
  function edit(key: keyof ZoneFields, value: string) {
    if (key === "latitude" || key === "longitude") { locateToken.current++; setLocationStatus(""); }
    if (key === "code") codeTouched.current = true;
    setFields(old => key === "label" && !codeTouched.current
      ? { ...old, label: value, code: value.trim() ? suggestZoneCode(value) : "" }
      : { ...old, [key]: value });
    setTouched(true);
  }
  function close() {
    if (dirty && !window.confirm(phrase(locale, "Discard unsaved zone changes?", "تجاهل تغييرات المنطقة غير المحفوظة؟"))) return;
    onClose();
  }
  function locate() {
    if (!window.isSecureContext || !navigator.geolocation) {
      setLocationStatus(phrase(locale, "Location unavailable in this browser or insecure context.", "تحديد الموقع غير متاح في المتصفح أو الاتصال غير آمن."));
      return;
    }
    const token = ++locateToken.current;
    setLocationStatus(phrase(locale, "Locating once…", "جارٍ تحديد الموقع مرة واحدة…"));
    navigator.geolocation.getCurrentPosition(position => {
      if (token !== locateToken.current || document.visibilityState !== "visible") return;
      setFields(old => ({ ...old, latitude: String(Number(position.coords.latitude.toFixed(6))),
        longitude: String(Number(position.coords.longitude.toFixed(6))) }));
      setTouched(true);
      setLocationStatus(phrase(locale, `Position proposed · ±${Math.round(position.coords.accuracy)} m (not saved)`,
        `تم اقتراح الموقع · ±${Math.round(position.coords.accuracy)} متر (غير محفوظ)`));
    }, error => {
      if (token !== locateToken.current) return;
      setLocationStatus(error.code === 1 ?
        phrase(locale, "Location permission denied. Enter coordinates manually.", "تم رفض إذن الموقع. يمكنك إدخال الإحداثيات يدويًا.") :
        phrase(locale, "Unable to determine location. Enter coordinates manually.", "تعذّر تحديد الموقع. أدخل الإحداثيات يدويًا."));
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 });
  }
  const point = fields.latitude.trim() && fields.longitude.trim() &&
    Number.isFinite(Number(fields.latitude)) && Number.isFinite(Number(fields.longitude)) &&
    Math.abs(Number(fields.latitude)) <= 90 && Math.abs(Number(fields.longitude)) <= 180 ?
    { lat: Number(fields.latitude), lng: Number(fields.longitude) } : null;
  return <dialog className="p321-zone-dialog" ref={dialog} aria-labelledby="p321-zone-dialog-title"
    onCancel={e => { e.preventDefault(); close(); }} onClick={e => { if (e.target === dialog.current) close(); }}>
    <form onSubmit={e => { e.preventDefault(); setTouched(true); if (parsed) onSave(parsed); }}>
      <header><div><h2 id="p321-zone-dialog-title">{phrase(locale, zone ? "Edit Attendance Zone" : "Add Attendance Zone", zone ? "تعديل منطقة الحضور" : "إضافة منطقة حضور")}</h2>
        <p>{phrase(locale, "Choose a point on the map or enter exact coordinates. Each zone saves separately.", "اختر نقطة على الخريطة أو أدخل الإحداثيات. كل منطقة تُحفظ بشكل مستقل.")}</p></div>
        <div><HelpDialog helpKey="presence.zoneForm" locale={locale} /><button className="p321-outline" type="button" onClick={close} aria-label={phrase(locale, "Close dialog", "إغلاق النافذة")}>✕</button></div></header>
      <PrototypeMap locale={locale} theme={theme} zones={[]} point={point} radius={Number(fields.radiusMeters)}
        onPick={picked => { locateToken.current++; setLocationStatus(""); setFields(old => ({ ...old, latitude: String(picked.lat), longitude: String(picked.lng) })); setTouched(true); }} />
      <div className="p321-zone-grid">
        {(["label", "code", "latitude", "longitude", "radiusMeters"] as const).map(key => (
          <label key={key}>{({
            label: phrase(locale, "Label", "اسم المنطقة"), code: phrase(locale, "Code", "الرمز"), latitude: phrase(locale, "Latitude", "خط العرض"),
            longitude: phrase(locale, "Longitude", "خط الطول"), radiusMeters: phrase(locale, "Radius (meters)", "نصف القطر (متر)"),
          })[key]}
            <input dir={key === "label" ? undefined : "ltr"} type={key === "radiusMeters" ? "number" : "text"}
              step={key === "radiusMeters" ? "any" : undefined} value={fields[key]} onChange={e => edit(key, e.target.value)}
              maxLength={key === "label" ? 200 : key === "code" ? 64 : undefined} />
          </label>
        ))}
        <label>{phrase(locale, "Status", "الحالة")}<select value={fields.state} onChange={e => edit("state", e.target.value)}>
          <option value="ACTIVE">{phrase(locale, "Active", "نشطة")}</option><option value="DISABLED">{phrase(locale, "Disabled", "معطلة")}</option>
        </select></label>
      </div>
      <button type="button" className="p321-outline" onClick={locate}>{phrase(locale, "Use My Current Location", "استخدام موقعي الحالي")}</button>
      <p role="status" aria-live="polite" className="p321-zone-hint">{locationStatus || (import.meta.env.VITE_GOOGLE_MAPS_API_KEY
        ? phrase(locale,
          "One-time foreground location. Preview map requests may share the viewed center with Google; no VAYLET API or continuous tracking.",
          "تحديد موقع لحظي عند الطلب. قد تنقل معاينة Google مركز العرض إلى مزود الخرائط؛ دون اتصال VAYLET أو تتبّع مستمر.")
        : phrase(locale,
          "One-time foreground location; offline coordinate preview. No network transfer, tracking or real save.",
          "تحديد موقع لحظي عند الطلب ومعاينة إحداثيات محلية؛ دون إرسال عبر الشبكة أو تتبّع أو حفظ فعلي."))}</p>
      {touched && !parsed && <p className="p321-error" role="alert">{phrase(locale,
        "Enter a label and unique code, valid coordinates, and a radius of 5–1000 meters.",
        "أدخل اسمًا ورمزًا فريدًا وإحداثيات صالحة ونصف قطر بين ٥ و١٠٠٠ متر.")}</p>}
      <footer><button className="p321-outline" type="button" onClick={close}>{phrase(locale, "Cancel", "إلغاء")}</button>
        <button type="submit" className="p321-save" disabled={!parsed || !dirty}>{phrase(locale, "Save Simulation", "حفظ المحاكاة")}</button></footer>
    </form>
  </dialog>;
}
