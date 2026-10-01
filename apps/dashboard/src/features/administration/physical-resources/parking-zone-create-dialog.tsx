"use client";

import type { ParkingZoneSelector } from "@valet/contracts";
import { useLayoutEffect, useRef, useState } from "react";
import { FocusDialog } from "../../../components/presentation/focus-dialog";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { DashboardApiError } from "../../../lib/api/dashboard-api-error";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import {
  administrationErrorMessage,
  isMfaRequired,
} from "../administration-error";
import { styles } from "../administration-ui";
import { SensitiveMfaDialog } from "../sensitive-mfa-dialog";
import {
  clearPhysicalResourceOperationId,
  physicalResourceOperationId,
} from "./physical-resource-operation-id";
import { createParkingZone } from "./physical-resources-api";
import { physicalResourcesCopy } from "./physical-resources-copy";
import presentation from "./physical-resources.module.css";

export function ParkingZoneCreateDialog(props: {
  readonly api: DashboardApiClient;
  readonly identityGeneration: number;
  readonly locationId: string;
  readonly scopeKey: string;
  readonly onClose: () => void;
  readonly onCreated: (zone: ParkingZoneSelector) => void;
  readonly onReconcile: () => void;
}) {
  const { locale } = useDashboardLocale();
  const t = physicalResourcesCopy(locale);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mfaOpen, setMfaOpen] = useState(false);
  const busyRef = useRef(false);
  const ticket = useRef<string | null>(props.scopeKey);
  useLayoutEffect(() => {
    ticket.current = props.scopeKey;
    return () => {
      ticket.current = null;
    };
  }, [props.scopeKey]);

  async function submit() {
    if (busyRef.current) return;
    const scope = props.scopeKey;
    const isCurrent = () => ticket.current === scope;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const draft = { code: code.trim(), label: label.trim() };
    const requestKey = JSON.stringify(draft);
    const operationId = physicalResourceOperationId(
      props.identityGeneration,
      props.locationId,
      "parking-zone",
      requestKey,
    );
    try {
      const zone = await createParkingZone(props.api, props.locationId, {
        ...draft,
        operationId,
      });
      if (!isCurrent()) return;
      clearPhysicalResourceOperationId(
        props.identityGeneration,
        props.locationId,
        "parking-zone",
        requestKey,
      );
      props.onCreated(zone);
    } catch (reason) {
      if (!isCurrent()) return;
      props.onReconcile();
      if (isMfaRequired(reason)) setMfaOpen(true);
      else if (
        reason instanceof DashboardApiError &&
        reason.code === "RESOURCE_CODE_CONFLICT"
      )
        setError(t.zoneCodeConflict);
      else
        setError(
          reason instanceof DashboardApiError &&
            ["network", "malformed", "unknown"].includes(reason.kind)
            ? t.unknownOutcome
            : administrationErrorMessage(reason),
        );
    } finally {
      if (isCurrent()) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  if (mfaOpen)
    return (
      <SensitiveMfaDialog
        api={props.api}
        onAssured={() => {
          if (ticket.current !== props.scopeKey) return;
          setMfaOpen(false);
          setError(t.retryExplicit);
        }}
        onClose={() => {
          if (ticket.current === props.scopeKey) setMfaOpen(false);
        }}
      />
    );

  return (
    <div className={presentation.dialogHost}>
      <FocusDialog label={t.addParkingZone} onClose={props.onClose}>
        <h2>{t.addParkingZone}</h2>
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
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
          <label className={presentation.field}>
            <span>{t.label}</span>
            <input
              autoComplete="off"
              maxLength={160}
              required
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
          {error ? (
            <p className={presentation.error} role="alert">
              {error}
            </p>
          ) : null}
          <div className={presentation.dialogActions}>
            <button
              className={styles.secondary}
              type="button"
              disabled={busy}
              onClick={props.onClose}
            >
              {t.cancel}
            </button>
            <button
              className={styles.primary}
              type="submit"
              disabled={busy || !code.trim() || !label.trim()}
            >
              {busy ? t.creating : t.create}
            </button>
          </div>
        </form>
      </FocusDialog>
    </div>
  );
}
