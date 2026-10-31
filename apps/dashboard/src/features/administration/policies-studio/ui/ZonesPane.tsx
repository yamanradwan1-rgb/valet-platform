import { useEffect, useState } from "react";
import { MapPin, Plus, Pencil } from "lucide-react";
import { Button } from "../../../../components/presentation/button";
import { ContextHelp } from "../../../../features/help/context-help";
import type { StudioZone as Zone } from "./studio-types";
import { useStudio } from "./studio-context";
import { OfflineMap } from "./OfflineMap";
import { ui } from "./copy";
import { ZoneForm } from "./ZoneForm";
import { useAttendanceZoneLocation } from "../../../../features/administration/settings/use-attendance-zone-location";

export function ZonesPane() {
  const {
    locale,
    adapter,
    editable,
    setDirty,
    identity,
    announce,
  } = useStudio();
  const ar = locale === "ar";
  const copy = ui[locale];
  const zones = adapter.presence.zones;
  const [selected, setSelected] = useState<Zone | null>(zones[0] ?? null);
  const canonicalSelected =
    zones.find((zone) => zone.id === selected?.id) ?? zones[0] ?? null;
  const [draft, setDraft] = useState<Zone | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const deviceLocation = useAttendanceZoneLocation((center) => {
    setDraft((old) =>
      old ? { ...old, latitude: center.lat, longitude: center.lng } : old,
    );
  });
  const changed =
    draft !== null &&
    JSON.stringify(draft) !==
      JSON.stringify(zones.find((zone) => zone.id === draft.id));
  useEffect(() => {
    setDirty(changed);
  }, [changed, setDirty]);
  function edit(zone: Zone) {
    if (changed && !window.confirm(copy.leave)) return;
    deviceLocation.retire();
    setError("");
    setSelected(zone);
    setDraft(structuredClone(zone));
  }
  function patch(value: Partial<Zone>) {
    deviceLocation.retire();
    setDraft((old) => (old ? { ...old, ...value } : old));
  }
  async function save() {
    if (!draft || !editable || saving || adapter.presence.busy) return;
    deviceLocation.retire();
    const normalized = {
      ...draft,
      code: draft.code.trim(),
      label: draft.label.trim(),
    };
    const duplicate = zones.some(
      (zone) => zone.id !== draft.id && zone.code === normalized.code,
    );
    if (
      !normalized.code ||
      normalized.code.length > 64 ||
      !normalized.label ||
      normalized.label.length > 200 ||
      duplicate ||
      !Number.isFinite(draft.latitude) ||
      Math.abs(draft.latitude) > 90 ||
      !Number.isFinite(draft.longitude) ||
      Math.abs(draft.longitude) > 180 ||
      !Number.isFinite(draft.radius) ||
      draft.radius < 5 ||
      draft.radius > 1000
    ) {
      setError(
        ar
          ? "راجع الحقول: رمز فريد، اسم، إحداثيات صالحة ونصف قطر من 5 إلى 1000 متر."
          : "Check the fields: unique code, label, valid coordinates and radius from 5 to 1000 meters.",
      );
      return;
    }
    setSaving(true);
    try {
      const result = await adapter.presence.saveZone(normalized);
      if (!result.ok) {
        setError(result.message ?? copy.errorBody);
        return;
      }
      setSelected(normalized);
      setDraft(null);
      setDirty(false);
      announce("");
      requestAnimationFrame(() =>
        document.getElementById(`zone-${normalized.id}`)?.focus(),
      );
    } catch {
      setError(copy.errorBody);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="ps-zones">
      <div className="ps-related">
        <p>
          {ar
            ? "مناطق محفوظة لهذا الموقع فقط، ولا تُورث من الشركة."
            : "Zones belong to this location only. They are not inherited from the company."}
        </p>
        {editable && !draft && (
          <Button
            variant="secondary"
            onClick={() =>
              edit({
                id: crypto.randomUUID(),
                code: "",
                label: "",
                latitude: Number.NaN,
                longitude: Number.NaN,
                radius: 80,
                status: "ACTIVE",
                revision: null,
              })
            }
          >
            <Plus size={16} aria-hidden="true" />
            {ar ? "إضافة منطقة" : "Add zone"}
          </Button>
        )}
      </div>
      <OfflineMap
        zones={zones}
        selected={draft ?? canonicalSelected}
        locale={locale}
        editable={!!draft && editable}
        onPick={(latitude, longitude) =>
          patch({
            latitude: Number(latitude.toFixed(6)),
            longitude: Number(longitude.toFixed(6)),
          })
        }
      />
      {draft ? (
        <ZoneForm
          draft={draft}
          location={deviceLocation}
          patch={patch}
          save={save}
          changed={changed && !saving && !adapter.presence.busy}
          error={error}
          onCancel={() => {
            deviceLocation.retire();
            setDraft(null);
            setDirty(false);
          }}
        />
      ) : (
        <div className="ps-zone-list">
          {!zones.length && (
            <div className="ps-state">
              <MapPin size={24} aria-hidden="true" />
              <h3>{ar ? "لا توجد مناطق حضور" : "No attendance zones"}</h3>
              <p>
                {ar
                  ? "احفظ منطقة قبل استخدام أوضاع الحضور الإلزامية."
                  : "Save a zone before using strict presence modes."}
              </p>
            </div>
          )}
          {zones.map((zone) => (
            <details key={zone.id} className="ps-zone-details">
              <summary id={`zone-${zone.id}`} onClick={() => setSelected(zone)}>
                <MapPin size={17} aria-hidden="true" />
                <strong>{zone.label}</strong>
                <span className="ps-source">
                  {zone.status === "ACTIVE"
                    ? ar
                      ? "نشطة"
                      : "Active"
                    : ar
                      ? "معطّلة"
                      : "Disabled"}
                </span>
              </summary>
              <div className="ps-related">
                <p>
                  <bdi>
                    {zone.code} · {zone.latitude}, {zone.longitude} ·{" "}
                    {zone.radius} m
                  </bdi>
                </p>
                {editable && (
                  <Button variant="secondary" onClick={() => edit(zone)}>
                    <Pencil size={14} aria-hidden="true" />
                    {copy.edit}
                  </Button>
                )}
                <ContextHelp
                  helpKey="presence.zones"
                  locale={locale}
                  scopeIdentity={identity}
                />
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
