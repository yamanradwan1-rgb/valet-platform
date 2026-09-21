"use client";

import {
  createLocationMapAreaRequestSchema,
  replaceLocationMapAreaVerticesRequestSchema,
  updateLocationMapAreaRequestSchema,
  type CreateLocationMapAreaRequest,
  type LocationMapArea,
  type ReplaceLocationMapAreaVerticesRequest,
  type UpdateLocationMapAreaRequest,
} from "@valet/contracts";
import { useState } from "react";

import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { operationsCopy } from "../operations-copy";
import { styles } from "../operations-ui";
import { MapSetupDialog } from "./map-setup-dialog";
import { MapSetupSelect } from "./map-setup-select";

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
        <Field label={t.code}><input className={styles.input} onChange={(e) => setCode(e.target.value)} value={code} /></Field>
        <Field label={t.label}><input className={styles.input} onChange={(e) => setLabel(e.target.value)} value={label} /></Field>
        <Field label={t.purpose}><MapSetupSelect onChange={(e) => setPurpose(e.target.value as CreateLocationMapAreaRequest["purpose"])} value={purpose}><option>PARKING</option><option>OVERFLOW</option><option>STAGING</option><option>RESTRICTED</option></MapSetupSelect></Field>
        <Field label={t.level}><input className={styles.input} onChange={(e) => setLevelLabel(e.target.value)} value={levelLabel} /></Field>
        <Field label={t.parkingZoneId}><input className={styles.input} onChange={(e) => setParkingZoneId(e.target.value)} value={parkingZoneId} /></Field>
      </div>
      {!original ? <Field label={`${t.vertices} (lat, lng — 3..500)`}><textarea className={styles.textarea} onChange={(e) => setVertices(e.target.value)} value={vertices} /></Field> : null}
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
    const parsed = replaceLocationMapAreaVerticesRequestSchema.safeParse({ vertices: parseVertices(value) });
    if (!parsed.success) { setError(t.invalidForm); return; }
    setError(null);
    if (await props.onSave(parsed.data)) props.onClose();
  };
  return <MapSetupDialog footer={<><button className={styles.secondary} onClick={props.onClose} type="button">{t.cancel}</button><button className={styles.primary} disabled={props.pending} onClick={() => void submit()} type="button">{t.save}</button></>} onClose={props.onClose} subtitle={t.verticesSetupSubtitle} title={t.replaceVertices}><Field label={`${t.vertices} (lat, lng — 3..500)`}><textarea className={styles.textarea} onChange={(e) => setValue(e.target.value)} value={value} /></Field>{error ? <div className={styles.error} role="alert">{error}</div> : null}</MapSetupDialog>;
}

function Field({ children, label }: { readonly children: React.ReactNode; readonly label: string }) {
  return <label className={styles.field}><span className={styles.fieldLabel}>{label}</span>{children}</label>;
}
