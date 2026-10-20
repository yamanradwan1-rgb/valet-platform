"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { issue304CreateKeySlot } from "../../administration/physical-resources/issue304-create-key-slot";
import type { inspectorCopy } from "./resource-inspector-copy";

type Copy = ReturnType<typeof inspectorCopy>;

export function ResourceInspectorKeyCreate(props: {
  readonly api: DashboardApiClient;
  readonly identityGeneration: number;
  readonly locationId: string;
  readonly t: Copy;
  readonly onCreated: (keySlotId: string) => void;
  readonly onClose: () => void;
}) {
  const { t } = props;
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLElement | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const focusReturn = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.querySelector<HTMLInputElement>("input[name='code']")?.focus();
    return () => {
      alive.current = false;
      if (focusReturn?.isConnected) focusReturn.focus();
    };
  }, []);

  function keydown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      props.onClose();
    }
    if (event.key !== "Tab") return;
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
    if (busy || !code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await issue304CreateKeySlot(
        props.api,
        { identityGeneration: props.identityGeneration, locationId: props.locationId },
        { code, ...(label.trim() ? { label } : {}) },
      );
      if (alive.current) props.onCreated(created.keySlotId);
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error ? reason.message : t.error);
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  return (
    <div className="c-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) props.onClose();
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
          <button className="c-close" aria-label={t.close} disabled={busy} onClick={props.onClose} type="button">×</button>
        </div>
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
            <button className="c-quiet-action" disabled={busy} onClick={props.onClose} type="button">{t.cancel}</button>
            <button className="c-outline-action" disabled={busy} type="submit">{busy ? t.loading : t.addKey}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
