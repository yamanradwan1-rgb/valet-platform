"use client";

import type { ParkingZoneSelector } from "@valet/contracts";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FocusDialog } from "../../../components/presentation/focus-dialog";
import { ScopedContextHelp } from "../../help/scoped-context-help";
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
import { Issue304Option3Heading } from "./issue304-option3-heading";

export function ParkingZoneCreateDialog(props: {
  readonly api: DashboardApiClient;
  readonly identityGeneration: number;
  readonly locationId: string;
  readonly scopeKey: string;
  readonly onClose: () => void;
  readonly onCreated: (zone: ParkingZoneSelector) => void;
  readonly onReconcile: () => void;
  readonly fromKeysWorkspace?: boolean | undefined;
  readonly issue304Variant?: boolean | undefined;
}) {
  const { locale } = useDashboardLocale();
  const t = physicalResourcesCopy(locale);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mfaOpen, setMfaOpen] = useState(false);
  const [helpMounted, setHelpMounted] = useState(false);
  const busyRef = useRef(false);
  const ticket = useRef<string | null>(props.scopeKey);
  useEffect(() => {
    let active = true;
    // Preserve the original first input focus before the optional help appears.
    queueMicrotask(() => { if (active) setHelpMounted(true); });
    return () => { active = false; };
  }, []);
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
        {props.issue304Variant ? (
          <Issue304Option3Heading kicker="parking-zone" title={t.addParkingZone} locale={locale} onClose={props.onClose} />
        ) : (
          <div className={presentation.headingRow}>
            <h2>{t.addParkingZone}</h2>
            {props.fromKeysWorkspace && helpMounted ? <ScopedContextHelp helpKey="keys.resourceDetails" /> : null}
          </div>
        )}
        {props.issue304Variant ? (
          <p className="issue304-modal-disclaimer" lang={locale}>
            {locale === "ar" ? "ستُحفظ المنطقة في هذا الموقع." : "Create a parking zone in this Location."}
          </p>
        ) : null}
        <form
          className={props.issue304Variant ? "issue304-modal-form" : presentation.form}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className={props.issue304Variant ? undefined : presentation.field}>
            <span>{props.issue304Variant ? (locale === "ar" ? "رمز المورد" : "Resource code") : t.code}</span>
            <input
              autoComplete="off"
              dir="ltr"
              maxLength={100}
              placeholder={props.issue304Variant ? "Z-C" : undefined}
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
          <label className={props.issue304Variant ? undefined : presentation.field}>
            <span>{props.issue304Variant ? (locale === "ar" ? "اسم العرض" : "Display label") : t.label}</span>
            <input
              autoComplete="off"
              maxLength={160}
              placeholder={props.issue304Variant ? (locale === "ar" ? "منطقة وقوف جديدة" : "New parking zone") : undefined}
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
          <div className={props.issue304Variant ? "issue304-modal-actions" : presentation.dialogActions}>
            <button
              className={props.issue304Variant ? "issue304-modal-quiet" : styles.secondary}
              type="button"
              disabled={busy}
              onClick={props.onClose}
            >
              {t.cancel}
            </button>
            <button
              className={props.issue304Variant ? "issue304-modal-primary" : styles.primary}
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
