"use client";

import {
  createLocationMapAreaRequestSchema,
  replaceLocationMapAreaVerticesRequestSchema,
  updateLocationMapAreaRequestSchema,
  type CreateLocationMapAreaRequest,
  type LocationMapArea,
  type ParkingZoneSelector,
  type ReplaceLocationMapAreaVerticesRequest,
  type UpdateLocationMapAreaRequest,
} from "@valet/contracts";
import { useState } from "react";

import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { operationsCopy } from "../operations-copy";
import { CursorControls, StatusBadge, styles } from "../operations-ui";
import { MapSetupDialog } from "./map-setup-dialog";
import { mapAreaPurposeLabel } from "./map-setup-presentation";
import { MapSetupSelect } from "./map-setup-select";
import reference from "./maps-reference.module.css";

function verticesText(area?: LocationMapArea) {
  return area?.vertices.map((vertex) => `${vertex.latitude}, ${vertex.longitude}`).join("\n") ?? "";
}

function parseVertices(value: string) {
  return value.split(/\r?\n/).filter((line) => line.trim() !== "").map((line) => {
    const [latitude, longitude] = line.split(",").map((part) => Number(part.trim()));
    return { latitude, longitude };
  });
}

export function AreaEditorDialog(props: {
  readonly area?: LocationMapArea | undefined;
  readonly onClose: () => void;
  readonly onSave: (value: CreateLocationMapAreaRequest | UpdateLocationMapAreaRequest) => Promise<boolean>;
  readonly parkingZones: readonly ParkingZoneSelector[];
  readonly parkingZonesCanNext: boolean;
  readonly parkingZonesCanPrevious: boolean;
  readonly parkingZonesError: Error | null;
  readonly parkingZonesLoading: boolean;
  readonly onParkingZonesNext: () => void;
  readonly onParkingZonesPrevious: () => void;
  readonly pending: boolean;
}) {
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  const original = props.area;
  const [code, setCode] = useState(original?.code ?? "");
  const [label, setLabel] = useState(original?.label ?? "");
  const [purpose, setPurpose] = useState<CreateLocationMapAreaRequest["purpose"]>(original?.purpose ?? "PARKING");
  const [levelLabel, setLevelLabel] = useState(original?.levelLabel ?? "");
  const [parkingZoneId, setParkingZoneId] = useState(original?.parkingZoneId ?? "");
  const [selectedZone, setSelectedZone] = useState<ParkingZoneSelector | null>(
    original?.parkingZone ?? null,
  );
  const [active, setActive] = useState(original?.active ?? true);
  const [vertices, setVertices] = useState(verticesText(original));
  const [error, setError] = useState<string | null>(null);
  const nullable = (value: string) => value.trim() === "" ? null : value.trim();

  const submit = async () => {
    setError(null);
    if (!original) {
      const parsed = createLocationMapAreaRequestSchema.safeParse({
        active, code, label, purpose, levelLabel: nullable(levelLabel),
        parkingZoneId: nullable(parkingZoneId), vertices: parseVertices(vertices),
      });
      if (!parsed.success) { setError(t.invalidForm); return; }
      if (await props.onSave(parsed.data)) props.onClose();
      return;
    }
    const update: UpdateLocationMapAreaRequest = {
      expectedUpdatedAt: original.updatedAt,
      ...(active === original.active ? {} : { active }),
      ...(code === original.code ? {} : { code }),
      ...(label === original.label ? {} : { label }),
      ...(purpose === original.purpose ? {} : { purpose }),
      ...(nullable(levelLabel) === original.levelLabel ? {} : { levelLabel: nullable(levelLabel) }),
      ...(nullable(parkingZoneId) === original.parkingZoneId ? {} : { parkingZoneId: nullable(parkingZoneId) }),
    };
    const parsed = updateLocationMapAreaRequestSchema.safeParse(update);
    if (!parsed.success) { setError(t.invalidForm); return; }
    if (await props.onSave(parsed.data)) props.onClose();
  };

  return (
    <MapSetupDialog
      footer={<><button className={styles.secondary} onClick={props.onClose} type="button">{t.cancel}</button><button className={styles.primary} disabled={props.pending} onClick={() => void submit()} type="button">{t.save}</button></>}
      onClose={props.onClose}
      subtitle={t.areaSetupSubtitle}
      title={original ? t.edit : t.addArea}
    >
      <div className={styles.formGrid}>
        <Field label={t.code}><input className={styles.input} dir="ltr" onChange={(e) => setCode(e.target.value)} value={code} /></Field>
        <Field label={t.label}><input className={styles.input} onChange={(e) => setLabel(e.target.value)} value={label} /></Field>
        <Field label={t.purpose}><MapSetupSelect onChange={(e) => setPurpose(e.target.value as CreateLocationMapAreaRequest["purpose"])} value={purpose}><option value="PARKING">{mapAreaPurposeLabel("PARKING", locale)}</option><option value="OVERFLOW">{mapAreaPurposeLabel("OVERFLOW", locale)}</option><option value="STAGING">{mapAreaPurposeLabel("STAGING", locale)}</option><option value="RESTRICTED">{mapAreaPurposeLabel("RESTRICTED", locale)}</option></MapSetupSelect></Field>
        <Field label={t.level}><input className={styles.input} onChange={(e) => setLevelLabel(e.target.value)} value={levelLabel} /></Field>
      </div>
      <details className={reference.advanced}>
        <summary>{t.advancedConfig}</summary>
        <p className={reference.advancedHelp}>{t.parkingZoneAssociationHelp}</p>
        <Field label={t.parkingZone}>
          <MapSetupSelect
            aria-label={t.parkingZone}
            disabled={props.parkingZonesLoading}
            onChange={(event) => {
              const id = event.target.value;
              setParkingZoneId(id);
              setSelectedZone(
                id === ""
                  ? null
                  : zoneOptions(selectedZone, props.parkingZones).find(
                      (zone) => zone.parkingZoneId === id,
                    ) ?? null,
              );
            }}
            value={parkingZoneId}
          >
            <option value="">{t.noParkingZone}</option>
            {zoneOptions(selectedZone, props.parkingZones).map((zone) => (
              <option key={zone.parkingZoneId} value={zone.parkingZoneId}>
                {zoneLabel(zone, t.inactive)}
              </option>
            ))}
          </MapSetupSelect>
        </Field>
        {selectedZone?.status === "INACTIVE" ? (
          <div className={styles.muted}>
            {zoneLabel(selectedZone, t.inactive)}{" "}
            <StatusBadge>{t.inactive}</StatusBadge>
          </div>
        ) : null}
        {props.parkingZonesError ? (
          <div className={styles.error} role="alert">{props.parkingZonesError.message}</div>
        ) : null}
        <CursorControls
          canNext={props.parkingZonesCanNext}
          canPrevious={props.parkingZonesCanPrevious}
          onNext={props.onParkingZonesNext}
          onPrevious={props.onParkingZonesPrevious}
        />
      </details>
      {!original ? <Field label={`${t.boundaryPoints} (lat, lng — 3..500)`}><textarea className={styles.textarea} dir="ltr" onChange={(e) => setVertices(e.target.value)} value={vertices} /></Field> : null}
      <label className={styles.field}><span className={styles.fieldLabel}>{t.active}</span><input checked={active} onChange={(e) => setActive(e.target.checked)} type="checkbox" /></label>
      {error ? <div className={styles.error} role="alert">{error}</div> : null}
    </MapSetupDialog>
  );
}

export function VerticesEditorDialog(props: {
  readonly area: LocationMapArea;
  readonly onClose: () => void;
  readonly onSave: (value: ReplaceLocationMapAreaVerticesRequest) => Promise<boolean>;
  readonly pending: boolean;
}) {
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  const [value, setValue] = useState(verticesText(props.area));
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    const parsed = replaceLocationMapAreaVerticesRequestSchema.safeParse({
      expectedUpdatedAt: props.area.updatedAt,
      vertices: parseVertices(value),
    });
    if (!parsed.success) { setError(t.invalidForm); return; }
    setError(null);
    if (await props.onSave(parsed.data)) props.onClose();
  };
  return <MapSetupDialog footer={<><button className={styles.secondary} onClick={props.onClose} type="button">{t.cancel}</button><button className={styles.primary} disabled={props.pending} onClick={() => void submit()} type="button">{t.save}</button></>} onClose={props.onClose} subtitle={t.verticesSetupSubtitle} title={t.editBoundary}><Field label={`${t.boundaryPoints} (lat, lng — 3..500)`}><textarea className={styles.textarea} dir="ltr" onChange={(e) => setValue(e.target.value)} value={value} /></Field>{error ? <div className={styles.error} role="alert">{error}</div> : null}</MapSetupDialog>;
}

function Field({ children, label }: { readonly children: React.ReactNode; readonly label: string }) {
  return <label className={styles.field}><span className={styles.fieldLabel}>{label}</span>{children}</label>;
}

function zoneOptions(
  selected: ParkingZoneSelector | null,
  page: readonly ParkingZoneSelector[],
) {
  if (selected === null || page.some((zone) => zone.parkingZoneId === selected.parkingZoneId)) {
    return page;
  }
  return [selected, ...page];
}

function zoneLabel(zone: ParkingZoneSelector, inactive: string) {
  const code = `\u2066${zone.code}\u2069`;
  return `${zone.label} — ${code}${zone.status === "INACTIVE" ? ` — ${inactive}` : ""}`;
}
