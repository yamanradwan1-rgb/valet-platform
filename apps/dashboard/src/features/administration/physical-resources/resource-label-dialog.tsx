"use client";

import type { PhysicalResourceLabel } from "@valet/contracts";
import { Download, Printer, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { FocusDialog } from "../../../components/presentation/focus-dialog";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { administrationErrorMessage } from "../administration-error";
import { styles } from "../administration-ui";
import { readPhysicalResourceLabel } from "./physical-resources-api";
import { physicalResourcesCopy } from "./physical-resources-copy";
import presentation from "./physical-resources.module.css";
import print from "./resource-label-print.module.css";
import {
  downloadPhysicalResourceLabel,
  renderPhysicalResourceLabelPng,
  resourceLabelFilename,
  resourceQrDataUrl,
} from "./resource-label-png";

export function ResourceLabelDialog(props: {
  readonly api: DashboardApiClient;
  readonly kind: "key-slot" | "parking-spot";
  readonly locationId: string;
  readonly onClose: () => void;
  readonly resourceId: string;
  readonly scopeKey: string;
}) {
  const { locale } = useDashboardLocale();
  const t = physicalResourcesCopy(locale);
  const [label, setLabel] = useState<PhysicalResourceLabel | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const currentScopeKeyRef = useRef(props.scopeKey);

  useLayoutEffect(() => {
    currentScopeKeyRef.current = props.scopeKey;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, [props.scopeKey]);

  const freshLabel = useCallback((signal?: AbortSignal) => {
    return readPhysicalResourceLabel(
      props.api,
      props.locationId,
      props.kind,
      props.resourceId,
      signal,
    );
  }, [props.api, props.kind, props.locationId, props.resourceId]);

  useEffect(() => {
    const controller = new AbortController();
    const scopeKey = props.scopeKey;
    const isCurrent = () =>
      mountedRef.current &&
      currentScopeKeyRef.current === scopeKey &&
      !controller.signal.aborted;
    void freshLabel(controller.signal).then(async (next) => {
      if (!isCurrent()) return;
      const nextQr = await resourceQrDataUrl(next.qrPayload);
      if (!isCurrent()) return;
      setLabel(next);
      setQrUrl(nextQr);
      setBusy(false);
    }, (reason) => {
      if (!isCurrent()) return;
      setError(administrationErrorMessage(reason));
      setBusy(false);
    });
    return () => controller.abort();
  }, [freshLabel, props.scopeKey]);

  async function download() {
    if (busy) return;
    const scopeKey = props.scopeKey;
    const isCurrent = () =>
      mountedRef.current && currentScopeKeyRef.current === scopeKey;
    setBusy(true); setError(null);
    try {
      const next = await freshLabel();
      if (!isCurrent()) return;
      const nextQr = await resourceQrDataUrl(next.qrPayload);
      if (!isCurrent()) return;
      setLabel(next);
      setQrUrl(nextQr);
      const blob = await renderPhysicalResourceLabelPng(next);
      if (!isCurrent()) return;
      downloadPhysicalResourceLabel(blob, resourceLabelFilename(next));
    } catch (reason) {
      if (isCurrent()) setError(administrationErrorMessage(reason));
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }

  async function printLabel() {
    if (busy) return;
    const scopeKey = props.scopeKey;
    const isCurrent = () =>
      mountedRef.current && currentScopeKeyRef.current === scopeKey;
    setBusy(true); setError(null);
    try {
      const next = await freshLabel();
      if (!isCurrent()) return;
      const nextQr = await resourceQrDataUrl(next.qrPayload);
      if (!isCurrent()) return;
      setLabel(next); setQrUrl(nextQr);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (!isCurrent()) return;
      window.print();
    } catch (reason) {
      if (isCurrent()) setError(administrationErrorMessage(reason));
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }

  return (
    <div className={presentation.labelHost}>
      <FocusDialog label={t.resourceLabel} onClose={props.onClose}>
        <div className={styles.toolbar}>
          <h2 className={styles.dialogTitle}>{t.resourceLabel}</h2>
          <button aria-label={t.cancel} className={styles.quiet} onClick={props.onClose} type="button"><X aria-hidden="true" size={16} /></button>
        </div>
        {busy && label === null ? <div className={styles.empty}>…</div> : null}
        {error ? <div className={styles.error} role="alert">{error}</div> : null}
        {label && qrUrl ? (
          <div className={`${presentation.label} ${print.printRoot}`} data-testid="physical-resource-print-label">
            <p className={presentation.brand}>VAYLET</p>
            <p className={presentation.resourceType}>{label.resourceType === "KEY_SLOT" ? t.keySlot : t.parkingSpot}</p>
            <bdi className={presentation.resourceCode} dir="ltr">{label.code}</bdi>
            <img alt={`${label.resourceType} ${label.code} QR`} className={presentation.qr} src={qrUrl} />
            <p className={presentation.location}>{label.location.name}</p>
            <bdi className={presentation.location} dir="ltr">{label.location.code}</bdi>
          </div>
        ) : null}
        <div className={`${presentation.labelActions} ${print.printHidden}`}>
          <button className={styles.secondary} disabled={busy || label === null} onClick={() => void download()} type="button"><Download aria-hidden="true" size={15} /> {t.download}</button>
          <button className={styles.primary} disabled={busy || label === null} onClick={() => void printLabel()} type="button"><Printer aria-hidden="true" size={15} /> {t.print}</button>
        </div>
      </FocusDialog>
    </div>
  );
}
