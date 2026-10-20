"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";

import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { DashboardApiError } from "../../../lib/api/dashboard-api-error";
import {
  administrationErrorMessage,
  isMfaRequired,
} from "../../administration/administration-error";
import { SensitiveMfaDialog } from "../../administration/sensitive-mfa-dialog";
import { issue304CreateKeySlot } from "../../administration/physical-resources/issue304-create-key-slot";
import type { inspectorCopy } from "./resource-inspector-copy";

type Copy = ReturnType<typeof inspectorCopy>;

export function ResourceInspectorKeyCreate(props: {
  readonly api: DashboardApiClient;
  readonly identityGeneration: number;
  readonly locationId: string;
  readonly scopeKey: string;
  readonly t: Copy;
  readonly onCreated: (keySlotId: string) => void;
  readonly onClose: () => void;
  readonly onReconcile: () => void;
}) {
  const { t } = props;
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mfaOpen, setMfaOpen] = useState(false);
  const dialog = useRef<HTMLElement | null>(null);
  const alive = useRef(false);
  const busyRef = useRef(false);
  const currentScope = useRef(props.scopeKey);
  const currentIdentity = useRef(props.identityGeneration);
  const currentLocation = useRef(props.locationId);

  useLayoutEffect(() => {
    alive.current = true;
    currentScope.current = props.scopeKey;
    currentIdentity.current = props.identityGeneration;
    currentLocation.current = props.locationId;
    return () => { alive.current = false; };
  }, [props.scopeKey, props.identityGeneration, props.locationId]);

  useEffect(() => {
    const focusReturn = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.querySelector<HTMLInputElement>("input[name='code']")?.focus();
    return () => {
      if (focusReturn?.isConnected) focusReturn.focus();
    };
  }, []);

  function keydown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && !busy && !mfaOpen) {
      event.preventDefault();
      props.onClose();
    }
    if (event.key !== "Tab" || mfaOpen) return;
    const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]),input:not([disabled]),select:not([disabled])',
    ) ?? [])];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current || mfaOpen || !code.trim()) return;
    const scopeKey = props.scopeKey;
    const identityGeneration = props.identityGeneration;
    const locationId = props.locationId;
    const isCurrent = () => alive.current && currentScope.current === scopeKey &&
      currentIdentity.current === identityGeneration && currentLocation.current === locationId;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const created = await issue304CreateKeySlot(
        props.api,
        { identityGeneration, locationId },
        { code, ...(label.trim() ? { label } : {}) },
      );
      if (isCurrent()) props.onCreated(created.keySlotId);
    } catch (reason) {
      if (!isCurrent()) return;
      // A rejected mutation is never retried implicitly. Re-read the actual
      // resource list before offering an explicit, idempotent resubmission.
      props.onReconcile();
      if (isMfaRequired(reason)) setMfaOpen(true);
      else if (reason instanceof DashboardApiError &&
        ["network", "malformed", "unknown"].includes(reason.kind)) {
        setError(t.unknownOutcome);
      } else setError(administrationErrorMessage(reason));
    } finally {
      busyRef.current = false;
      if (isCurrent()) setBusy(false);
    }
  }

  return (
    <div className="c-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy && !mfaOpen) props.onClose();
    }}>
      <section
        aria-labelledby="c-modal-title"
        aria-modal="true"
        className="c-modal"
        onKeyDown={keydown}
        ref={dialog}
        role="dialog"
        tabIndex={-1}
      >
        <div className="c-modal-heading">
          <div>
            <span className="c-kicker">{t.keySlot}</span>
            <h2 id="c-modal-title">{t.addKey}</h2>
          </div>
          <button className="c-close" aria-label={t.close} disabled={busy || mfaOpen} onClick={props.onClose} type="button">×</button>
        </div>
        <p className="c-modal-disclaimer">{t.keyCreateIntro}</p>
        <form className="c-add-form" onSubmit={(event) => { void submit(event); }}>
          <label>
            <span>{t.code}</span>
            <input name="code" autoComplete="off" maxLength={100} required value={code} onChange={(event) => setCode(event.target.value)} placeholder="K-08" />
          </label>
          <label>
            <span>{t.label}</span>
            <input name="label" autoComplete="off" maxLength={160} value={label} onChange={(event) => setLabel(event.target.value)} placeholder={t.labelPlaceholder} />
          </label>
          {error ? <p className="c-modal-disclaimer" role="alert">{error}</p> : null}
          <div className="c-modal-actions">
            <button className="c-quiet-action" disabled={busy || mfaOpen} onClick={props.onClose} type="button">{t.cancel}</button>
            <button className="c-outline-action" disabled={busy || mfaOpen} type="submit">{busy ? t.loading : t.addKey}</button>
          </div>
        </form>
        {mfaOpen ? (
          <SensitiveMfaDialog
            api={props.api}
            onAssured={() => {
              if (!alive.current || currentScope.current !== props.scopeKey ||
                currentIdentity.current !== props.identityGeneration ||
                currentLocation.current !== props.locationId) return;
              setMfaOpen(false);
              setError(t.retryExplicit);
            }}
            onClose={() => {
              if (alive.current && currentScope.current === props.scopeKey) setMfaOpen(false);
            }}
          />
        ) : null}
      </section>
    </div>
  );
}
