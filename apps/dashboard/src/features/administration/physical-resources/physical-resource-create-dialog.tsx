"use client";

import type { ParkingZoneSelector } from "@valet/contracts";
import { useEffect, useRef, useState } from "react";

import { FocusDialog } from "../../../components/presentation/focus-dialog";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { administrationErrorMessage, isMfaRequired } from "../administration-error";
import { styles } from "../administration-ui";
import { SensitiveMfaDialog } from "../sensitive-mfa-dialog";
import {
  createKeySlot,
  createParkingSpot,
  readParkingZones,
} from "./physical-resources-api";
import { physicalResourcesCopy } from "./physical-resources-copy";
import {
  clearPhysicalResourceOperationId,
  physicalResourceOperationId,
} from "./physical-resource-operation-id";
import presentation from "./physical-resources.module.css";

export function PhysicalResourceCreateDialog(props: {
  readonly api: DashboardApiClient;
  readonly identityGeneration: number;
  readonly kind: "key-slot" | "parking-spot";
  readonly locationId: string;
  readonly onClose: () => void;
  readonly onCreated: (resourceId: string) => void;
  readonly onReconcile: () => void;
}) {
  const { locale } = useDashboardLocale();
  const t = physicalResourcesCopy(locale);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [zones, setZones] = useState<ParkingZoneSelector[]>([]);
  const [zonesLoading, setZonesLoading] = useState(props.kind === "parking-spot");
  const [error, setError] = useState<string | null>(null);
  const [mfaOpen, setMfaOpen] = useState(false);

  useEffect(() => {
    if (props.kind !== "parking-spot") return;
    const controller = new AbortController();
    void readParkingZones(props.api, props.locationId, controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return;
        setZones(result.items);
        setZonesLoading(false);
      },
      (reason) => {
        if (controller.signal.aborted) return;
        setError(administrationErrorMessage(reason));
        setZonesLoading(false);
      },
    );
    return () => controller.abort();
  }, [props.api, props.kind, props.locationId]);

  async function submit() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const requestKey =
      props.kind === "key-slot"
        ? JSON.stringify({ code: code.trim() })
        : JSON.stringify({ code: code.trim(), label: label.trim(), parkingZoneId: zoneId });
    const operationId = physicalResourceOperationId(
      props.identityGeneration,
      props.locationId,
      props.kind,
      requestKey,
    );
    try {
      if (props.kind === "key-slot") {
        const result = await createKeySlot(props.api, props.locationId, {
          code,
          operationId,
        });
        clearPhysicalResourceOperationId(
          props.identityGeneration,
          props.locationId,
          props.kind,
          requestKey,
        );
        props.onCreated(result.keySlotId);
      } else {
        const result = await createParkingSpot(props.api, props.locationId, {
          code,
          label,
          operationId,
          parkingZoneId: zoneId,
        });
        clearPhysicalResourceOperationId(
          props.identityGeneration,
          props.locationId,
          props.kind,
          requestKey,
        );
        props.onCreated(result.parkingSpotId);
      }
    } catch (reason) {
      props.onReconcile();
      if (isMfaRequired(reason)) setMfaOpen(true);
      else setError(administrationErrorMessage(reason));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const title = props.kind === "key-slot" ? t.addKeySlot : t.addParkingSpot;
  return (
    <div className={presentation.dialogHost}>
      <FocusDialog label={title} onClose={props.onClose}>
        <h2>{title}</h2>
        <form className={presentation.form} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <label className={presentation.field}>
            <span>{t.code}</span>
            <input autoComplete="off" dir="ltr" maxLength={100} onChange={(event) => setCode(event.target.value)} required value={code} />
          </label>
          {props.kind === "parking-spot" ? (
            <>
              <label className={presentation.field}>
                <span>{t.label}</span>
                <input autoComplete="off" maxLength={160} onChange={(event) => setLabel(event.target.value)} required value={label} />
              </label>
              <label className={presentation.field}>
                <span>{t.parkingZone}</span>
                <select disabled={zonesLoading} onChange={(event) => setZoneId(event.target.value)} required value={zoneId}>
                  <option value="">{t.selectZone}</option>
                  {zones.map((zone) => (
                    <option key={zone.parkingZoneId} value={zone.parkingZoneId}>{zone.label} — {zone.code}</option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
          {error ? <p className={presentation.error} role="alert">{error}</p> : null}
          <div className={presentation.dialogActions}>
            <button className={styles.secondary} disabled={busy} onClick={props.onClose} type="button">{t.cancel}</button>
            <button className={styles.primary} disabled={busy || code.trim() === "" || (props.kind === "parking-spot" && (label.trim() === "" || zoneId === ""))} type="submit">{busy ? t.creating : t.create}</button>
          </div>
        </form>
        {mfaOpen ? (
          <SensitiveMfaDialog
            api={props.api}
            onAssured={() => {
              setMfaOpen(false);
              setError(t.retryExplicit);
            }}
            onClose={() => setMfaOpen(false)}
          />
        ) : null}
      </FocusDialog>
    </div>
  );
}
