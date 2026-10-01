"use client";

import type { ParkingZoneSelector } from "@valet/contracts";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { FocusDialog } from "../../../components/presentation/focus-dialog";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import {
  administrationErrorMessage,
  isMfaRequired,
} from "../administration-error";
import { styles } from "../administration-ui";
import { SensitiveMfaDialog } from "../sensitive-mfa-dialog";
import { createKeySlot, createParkingSpot } from "./physical-resources-api";
import { physicalResourcesCopy } from "./physical-resources-copy";
import {
  clearPhysicalResourceOperationId,
  physicalResourceOperationId,
} from "./physical-resource-operation-id";
import presentation from "./physical-resources.module.css";
import { ParkingZoneCreateDialog } from "./parking-zone-create-dialog";
import { ParkingZonePicker } from "./parking-zone-picker";
import { useParkingZonePage } from "./use-parking-zone-page";

export function PhysicalResourceCreateDialog(props: {
  readonly api: DashboardApiClient;
  readonly identityGeneration: number;
  readonly kind: "key-slot" | "parking-spot";
  readonly locationId: string;
  readonly onClose: () => void;
  readonly onCreated: (resourceId: string) => void;
  readonly onReconcile: () => void;
  readonly scopeKey: string;
}) {
  const { locale } = useDashboardLocale();
  const t = physicalResourcesCopy(locale);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [selectedZone, setSelectedZone] = useState<ParkingZoneSelector | null>(
    null,
  );
  const [zoneOpen, setZoneOpen] = useState(false);
  const addZoneRef = useRef<HTMLButtonElement>(null);
  const restoreZoneFocus = useRef(false);
  const zonePage = useParkingZonePage(
    props.api,
    props.locationId,
    props.scopeKey,
    props.kind === "parking-spot",
  );
  const zones = [...(zonePage.data?.items ?? [])];
  if (
    selectedZone &&
    !zones.some((zone) => zone.parkingZoneId === selectedZone.parkingZoneId)
  )
    zones.push(selectedZone);
  const [error, setError] = useState<string | null>(null);
  const [mfaOpen, setMfaOpen] = useState(false);
  const mountedRef = useRef(true);
  const currentScopeKeyRef = useRef(props.scopeKey);

  useLayoutEffect(() => {
    currentScopeKeyRef.current = props.scopeKey;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, [props.scopeKey]);

  useEffect(() => {
    if (!zoneOpen && restoreZoneFocus.current) {
      restoreZoneFocus.current = false;
      const scope = props.scopeKey;
      queueMicrotask(() => {
        if (mountedRef.current && currentScopeKeyRef.current === scope)
          addZoneRef.current?.focus();
      });
    }
  }, [zoneOpen, props.scopeKey]);
  function closeZone() {
    restoreZoneFocus.current = true;
    setZoneOpen(false);
  }

  async function submit() {
    if (busyRef.current) return;
    const scopeKey = props.scopeKey;
    const isCurrent = () =>
      mountedRef.current && currentScopeKeyRef.current === scopeKey;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const requestKey =
      props.kind === "key-slot"
        ? JSON.stringify({ code: code.trim() })
        : JSON.stringify({
            code: code.trim(),
            label: label.trim(),
            parkingZoneId: zoneId,
          });
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
        if (isCurrent()) props.onCreated(result.keySlotId);
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
        if (isCurrent()) props.onCreated(result.parkingSpotId);
      }
    } catch (reason) {
      if (!isCurrent()) return;
      props.onReconcile();
      if (isMfaRequired(reason)) setMfaOpen(true);
      else setError(administrationErrorMessage(reason));
    } finally {
      busyRef.current = false;
      if (isCurrent()) setBusy(false);
    }
  }

  if (zoneOpen)
    return (
      <ParkingZoneCreateDialog
        api={props.api}
        identityGeneration={props.identityGeneration}
        locationId={props.locationId}
        scopeKey={props.scopeKey}
        onClose={closeZone}
        onReconcile={zonePage.refresh}
        onCreated={(zone) => {
          if (
            !mountedRef.current ||
            currentScopeKeyRef.current !== props.scopeKey
          )
            return;
          setSelectedZone(zone);
          setZoneId(zone.parkingZoneId);
          closeZone();
        }}
      />
    );

  const title = props.kind === "key-slot" ? t.addKeySlot : t.addParkingSpot;
  return (
    <div className={presentation.dialogHost}>
      <FocusDialog label={title} onClose={props.onClose}>
        <h2>{title}</h2>
        <form
          className={presentation.form}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className={presentation.field}>
            <span>{t.code}</span>
            <input
              autoComplete="off"
              dir="ltr"
              maxLength={100}
              onChange={(event) => setCode(event.target.value)}
              required
              value={code}
            />
          </label>
          {props.kind === "parking-spot" ? (
            <>
              <label className={presentation.field}>
                <span>{t.label}</span>
                <input
                  autoComplete="off"
                  maxLength={160}
                  onChange={(event) => setLabel(event.target.value)}
                  required
                  value={label}
                />
              </label>
              <ParkingZonePicker
                page={zonePage}
                zones={zones}
                zoneId={zoneId}
                busy={busy}
                addRef={addZoneRef}
                onAdd={() => setZoneOpen(true)}
                onSelect={(id) => {
                  setZoneId(id);
                  setSelectedZone(
                    zones.find((zone) => zone.parkingZoneId === id) ?? null,
                  );
                }}
              />
            </>
          ) : null}
          {error ? (
            <p className={presentation.error} role="alert">
              {error}
            </p>
          ) : null}
          <div className={presentation.dialogActions}>
            <button
              className={styles.secondary}
              disabled={busy}
              onClick={props.onClose}
              type="button"
            >
              {t.cancel}
            </button>
            <button
              className={styles.primary}
              disabled={
                busy ||
                code.trim() === "" ||
                (props.kind === "parking-spot" &&
                  (label.trim() === "" || zoneId === ""))
              }
              type="submit"
            >
              {busy ? t.creating : t.create}
            </button>
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
