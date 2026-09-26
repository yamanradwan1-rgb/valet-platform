"use client";

import {
  createLocationMapPointRequestSchema,
  updateLocationMapPointRequestSchema,
  type CreateLocationMapPointRequest,
  type LocationMapPoint,
  type UpdateLocationMapPointRequest,
} from "@valet/contracts";
import { useState } from "react";

import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { operationsCopy } from "../operations-copy";
import { styles } from "../operations-ui";
import { MapSetupDialog } from "./map-setup-dialog";
import { mapPointKindLabel } from "./map-setup-presentation";
import { MapSetupSelect } from "./map-setup-select";

export function PointEditorDialog(props: {
  readonly onClose: () => void;
  readonly onSave: (value: CreateLocationMapPointRequest | UpdateLocationMapPointRequest) => Promise<boolean>;
  readonly pending: boolean;
  readonly point?: LocationMapPoint | undefined;
}) {
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  const original = props.point;
  const [code, setCode] = useState(original?.code ?? "");
  const [label, setLabel] = useState(original?.label ?? "");
  const [kind, setKind] = useState<CreateLocationMapPointRequest["kind"]>(original?.kind ?? "ENTRANCE");
  const [latitude, setLatitude] = useState(String(original?.latitude ?? ""));
  const [longitude, setLongitude] = useState(String(original?.longitude ?? ""));
  const [levelLabel, setLevelLabel] = useState(original?.levelLabel ?? "");
  const [active, setActive] = useState(original?.active ?? true);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const full = {
      active,
      code,
      kind,
      label,
      latitude: Number(latitude),
      levelLabel: levelLabel.trim() === "" ? null : levelLabel,
      longitude: Number(longitude),
    };
    if (!original) {
      const parsed = createLocationMapPointRequestSchema.safeParse(full);
      if (!parsed.success) { setError(t.invalidForm); return; }
      if (await props.onSave(parsed.data)) props.onClose();
      return;
    }
    const update: UpdateLocationMapPointRequest = {
      ...(active === original.active ? {} : { active }),
      ...(code === original.code ? {} : { code }),
      ...(kind === original.kind ? {} : { kind }),
      ...(label === original.label ? {} : { label }),
      ...(Number(latitude) === original.latitude ? {} : { latitude: Number(latitude) }),
      ...((levelLabel.trim() === "" ? null : levelLabel) === original.levelLabel ? {} : { levelLabel: levelLabel.trim() === "" ? null : levelLabel }),
      ...(Number(longitude) === original.longitude ? {} : { longitude: Number(longitude) }),
    };
    const parsed = updateLocationMapPointRequestSchema.safeParse(update);
    if (!parsed.success) { setError(t.invalidForm); return; }
    if (await props.onSave(parsed.data)) props.onClose();
  };

  return (
    <MapSetupDialog
      footer={<><button className={styles.secondary} onClick={props.onClose} type="button">{t.cancel}</button><button className={styles.primary} disabled={props.pending} onClick={() => void submit()} type="button">{t.save}</button></>}
      onClose={props.onClose}
      subtitle={t.pointSetupSubtitle}
      title={original ? t.edit : t.addPoint}
    >
      <div className={styles.formGrid}>
        <Field label={t.code}><input className={styles.input} dir="ltr" onChange={(e) => setCode(e.target.value)} value={code} /></Field>
        <Field label={t.label}><input className={styles.input} onChange={(e) => setLabel(e.target.value)} value={label} /></Field>
        <Field label={t.kind}><MapSetupSelect onChange={(e) => setKind(e.target.value as CreateLocationMapPointRequest["kind"])} value={kind}><option value="ENTRANCE">{mapPointKindLabel("ENTRANCE", locale)}</option><option value="PICKUP">{mapPointKindLabel("PICKUP", locale)}</option><option value="DROP_OFF">{mapPointKindLabel("DROP_OFF", locale)}</option></MapSetupSelect></Field>
        <Field label={t.level}><input className={styles.input} onChange={(e) => setLevelLabel(e.target.value)} value={levelLabel} /></Field>
        <Field label={t.latitude}><input className={styles.input} dir="ltr" inputMode="decimal" onChange={(e) => setLatitude(e.target.value)} value={latitude} /></Field>
        <Field label={t.longitude}><input className={styles.input} dir="ltr" inputMode="decimal" onChange={(e) => setLongitude(e.target.value)} value={longitude} /></Field>
      </div>
      <label className={styles.field}><span className={styles.fieldLabel}>{t.active}</span><input checked={active} onChange={(e) => setActive(e.target.checked)} type="checkbox" /></label>
      {error ? <div className={styles.error} role="alert">{error}</div> : null}
    </MapSetupDialog>
  );
}

function Field({ children, label }: { readonly children: React.ReactNode; readonly label: string }) {
  return <label className={styles.field}><span className={styles.fieldLabel}>{label}</span>{children}</label>;
}
