"use client";

import { AlertCircle, Bell, Check, Radio, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { uxCopy } from "./ux-copy";
import type { PreviewStatus } from "./use-alert-lab";
import type { Connection, DemoRole, Locale, SyntheticAlert, Variant } from "./types";
import { useAlertPanelGeometry } from "./use-alert-panel-geometry";
import { useSyntheticDestinationHashRestore } from "./use-synthetic-destination-hash-restore";
import { useSeenFocusRecovery } from "./use-seen-focus-recovery";
import { AlertCard } from "./alert-card";
import { SyntheticDestinationPreview } from "./synthetic-destination-preview";

type Props = {
  locale: Locale;
  role: DemoRole;
  variant: Variant;
  items: SyntheticAlert[];
  count: number;
  status: PreviewStatus;
  connection: Connection;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSeen: (alert: SyntheticAlert) => void;
  seen: Set<string>;
  pendingId: string | null;
  seenFailure: string | null;
  onRetry: () => void;
};

export function AlertsPopover({
  locale, role, variant, items, count, status, connection, open, onOpenChange,
  onSeen, seen, pendingId, seenFailure, onRetry,
}: Props) {
  const t = uxCopy[locale];
  const bellRef = useRef<HTMLButtonElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const focusPanelOnOpen = useRef(false);
  const pointerTabEntryArmed = useRef(false);
  const focusPanelAfterTab = useRef(false);
  const panelHadFocus = useRef(false);
  const { geometry, resetGeometry } = useAlertPanelGeometry(open, bellRef, locale);
  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) resetGeometry();
    onOpenChange(nextOpen);
  }, [onOpenChange, resetGeometry]);
  const listId = useId();
  const titleId = useId();
  const unavailable = status === "unavailable" || status === "unauthorized" || status === "loading" ||
    status === "slow" || connection === "revoked";
  const stale = status === "failure" || connection === "offline" || connection === "reconnecting";
  const badgeText = unavailable ? "—" : count > 20 ? "20+" : String(count);
  const visibleItems = items.slice(0, 20);
  const hasAvailableDestination = status === "ready" && connection === "connected" && role !== "unauthorized" &&
    visibleItems.some((item) => item.destination.state === "available");
  useSyntheticDestinationHashRestore(open, geometry !== null, hasAvailableDestination, handleOpenChange);
  const handleSeen = useSeenFocusRecovery(panelRef, bellRef, pendingId, seen, seenFailure, onSeen);

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: PointerEvent) {
      if (event.target instanceof Element &&
          event.target.closest(".issue432-prototype-tools")) {
        panelHadFocus.current = false;
        return;
      }
      if (event.target instanceof Node && !anchorRef.current?.contains(event.target) &&
          !panelRef.current?.contains(event.target)) {
        panelHadFocus.current = false;
        handleOpenChange(false);
      }
    }
    function closeWhenFocusLeaves(event: FocusEvent) {
      if (event.target instanceof Element &&
          event.target.closest(".issue432-prototype-tools")) {
        panelHadFocus.current = false;
        return;
      }
      if (event.target instanceof Node && panelRef.current?.contains(event.target)) {
        pointerTabEntryArmed.current = false;
        focusPanelOnOpen.current = false;
        focusPanelAfterTab.current = false;
        panelHadFocus.current = true;
        return;
      }
      if (event.target instanceof Node && anchorRef.current?.contains(event.target)) {
        panelHadFocus.current = false;
        return;
      }
      panelHadFocus.current = false;
      handleOpenChange(false);
    }
    function handlePanelKeyboard(event: KeyboardEvent) {
      const active = document.activeElement;
      const inside = active instanceof Node &&
        (anchorRef.current?.contains(active) || panelRef.current?.contains(active));
      const firstControl = panelRef.current?.querySelector<HTMLElement>(
        "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])",
      );
      if (event.key === "Tab" && event.shiftKey && active === firstControl) {
        event.preventDefault();
        bellRef.current?.focus();
        return;
      }
      if (event.key === "Escape" && inside) {
        event.preventDefault();
        event.stopPropagation();
        handleOpenChange(false);
        panelHadFocus.current = false;
        bellRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("focusin", closeWhenFocusLeaves);
    document.addEventListener("keydown", handlePanelKeyboard, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("focusin", closeWhenFocusLeaves);
      document.removeEventListener("keydown", handlePanelKeyboard, true);
    };
  }, [open, handleOpenChange]);

  useEffect(() => {
    if (open) return;
    if (connection === "revoked" && panelHadFocus.current) bellRef.current?.focus();
    panelHadFocus.current = false;
  }, [open, connection]);

  useEffect(() => {
    if (!open) {
      focusPanelOnOpen.current = false;
      pointerTabEntryArmed.current = false;
      focusPanelAfterTab.current = false;
      return;
    }
    if (geometry === null || (!focusPanelOnOpen.current && !focusPanelAfterTab.current)) return;
    focusPanelOnOpen.current = false;
    focusPanelAfterTab.current = false;
    panelRef.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
  }, [open, geometry]);

  return (
    <div className="issue432-bell-anchor" ref={anchorRef}>
      <button
        ref={bellRef}
        className="management-alert-bell"
        type="button"
        aria-label={connection === "revoked" ? `${t.alerts}: ${t.revoked}` : `${t.alerts}: ${unavailable ? t.notCurrent : stale ? t.lastKnown : t.unseenCount} ${badgeText}`}
        aria-disabled={connection === "revoked"}
        aria-expanded={open && connection !== "revoked"}
        aria-controls={open && connection !== "revoked" ? listId : undefined}
        onClick={(event) => {
          if (connection === "revoked") return;
          const nextOpen = !open;
          handleOpenChange(nextOpen);
          if (nextOpen) {
            focusPanelOnOpen.current = event.detail === 0;
            pointerTabEntryArmed.current = event.detail !== 0;
          }
        }}
        onKeyDown={(event) => {
          const pendingEntry = pointerTabEntryArmed.current || focusPanelOnOpen.current;
          if (event.key !== "Tab" || event.shiftKey || !open || !pendingEntry ||
              document.activeElement !== bellRef.current) return;
          event.preventDefault();
          pointerTabEntryArmed.current = false;
          focusPanelOnOpen.current = false;
          if (geometry === null) {
            focusPanelAfterTab.current = true;
            return;
          }
          focusPanelAfterTab.current = false;
          panelRef.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
        }}
      >
        <Bell size={18} strokeWidth={2} aria-hidden="true" />
        <span className={`management-alert-badge ${stale ? "management-alert-badge--stale" : ""}`} aria-hidden="true">
          {badgeText}
        </span>
      </button>
      <span className="issue432-sr-only" role="status" aria-live="polite">
        {connection === "revoked" ? t.revoked : `${t.unseenCount}: ${stale ? `${t.lastKnown}: ${badgeText}` : badgeText}`}
      </span>
      {open && connection !== "revoked" && typeof document !== "undefined" ? createPortal(
        <section
          ref={panelRef}
          className={`alerts-panel alerts-panel--${variant}`}
          style={geometry ? {
            left: `${geometry.left}px`,
            top: `${geometry.top}px`,
            width: `${geometry.width}px`,
            maxHeight: `${geometry.maxHeight}px`,
          } : { visibility: "hidden" }}
          role="region"
          aria-labelledby={titleId}
          id={listId}
          tabIndex={-1}
          dir={locale === "ar" ? "rtl" : "ltr"}
        >
          <header className="alerts-head">
            <div className="alerts-title-group">
              <div className="alerts-heading-line">
                <h2 id={titleId}>{t.alerts}</h2>
                <span className="alerts-head-count">{badgeText}</span>
              </div>
              <span className="alerts-subtitle">{t.unread}</span>
            </div>
            <button
              className="icon-only alerts-close"
              type="button"
              aria-label={t.close}
              onClick={() => { onOpenChange(false); bellRef.current?.focus(); }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          <div className="alerts-connection" aria-live="polite">
            <span className={`connection-dot connection-dot--${connection}`} />
            <span>{connection === "connected" ? t.online : connection === "offline" ? t.offline : t.reconnecting}</span>
            <span className="alerts-synthetic">{t.simulated}</span>
          </div>
          <div className="alerts-scroll">
            {status === "loading" || status === "slow" ? (
              <div className="alerts-empty" role="status">
                <span className="loading-ring" aria-hidden="true" />
                <h3>{t.hold}</h3>
                <p>{status === "slow" ? t.delayed : t.simulated}</p>
              </div>
            ) : status === "failure" || status === "unavailable" || status === "unauthorized" || stale ? (
              <div className="alerts-empty alerts-empty--warning" role="status">
                <AlertCircle size={25} aria-hidden="true" />
                <h3>{status === "unauthorized" ? t.noAccess : status === "failure" ? t.failed : t.deniedPreview}</h3>
                <p>{status === "unavailable" || status === "unauthorized" ? t.notCurrent : t.lastKnown}</p>
                {connection === "connected" && status !== "unauthorized" ? (
                  <button type="button" className="retry-button" onClick={onRetry}>{t.retry}</button>
                ) : null}
              </div>
            ) : items.length === 0 ? (
              <div className="alerts-empty" role="status">
                <span className="empty-illustration"><Check size={26} aria-hidden="true" /></span>
                <h3>{t.allCaught}</h3>
                <p>{t.caughtDescription}</p>
              </div>
            ) : (
              <>
                <ol className="alert-feed" aria-label={t.alerts}>
                  {visibleItems.map((item) => (
                    <AlertCard
                      key={item.id}
                      item={item}
                      locale={locale}
                      role={role}
                      seen={seen}
                      pendingId={pendingId}
                      seenFailure={seenFailure}
                      onSeen={handleSeen}
                    />
                  ))}
                </ol>
                <SyntheticDestinationPreview items={visibleItems} locale={locale} />
              </>
            )}
          </div>
          <footer className="alerts-foot">
            <span><Radio size={13} aria-hidden="true" /> {t.syntheticFooter}</span>
            {items.length > 20 && status === "ready" ? <span>{t.itemLimit}</span> : null}
          </footer>
        </section>,
        document.body,
      ) : null}
    </div>
  );
}
