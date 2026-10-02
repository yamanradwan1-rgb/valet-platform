"use client";
import type { StaffShiftHistoryEntry } from "@valet/contracts";
import { useEffect, useRef, useState } from "react";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { styles } from "../administration-ui";
import { StaffShiftDrawer } from "./staff-shift-drawer";
import { StaffForceEndDialog } from "./staff-force-end-dialog";
import { staffForceEndCopy } from "./staff-force-end-copy";
import type { ForceEndRecovery } from "./staff-force-end-recovery";
import type { ForceEndRead } from "./use-staff-shift-force-end";
import { forceEndFailure } from "./staff-force-end-intent";

export function StaffShiftManagementDrawer(props: {
  readonly read: ForceEndRead;
  readonly organizationId: string;
  readonly authorized: boolean;
  readonly recovery: ForceEndRecovery | null;
  readonly onRecoveryConsumed?: (() => void) | undefined;
  readonly now: number;
  readonly onClose: () => void;
  readonly onRetry: () => void;
  readonly onReconcile: () => void;
}) {
  const { locale } = useDashboardLocale();
  const t = staffForceEndCopy(locale);
  const [open, setOpen] = useState<{
    target: StaffShiftHistoryEntry;
    recovery: ForceEndRecovery | null;
  } | null>(null);
  const [restore, setRestore] = useState(props.recovery);
  const action = useRef<HTMLButtonElement>(null);
  const { read, onClose, onRecoveryConsumed } = props;
  const denied =
    props.read.error && forceEndFailure(props.read.error) === "denied";
  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => {
      if (disposed) return;
      if (denied) onClose();
      else if (restore && read.item && !read.loading && !read.error) {
        setOpen({ target: read.item, recovery: restore });
        setRestore(null);
        onRecoveryConsumed?.();
      }
    });
    return () => {
      disposed = true;
    };
  }, [denied, restore, read, onClose, onRecoveryConsumed]);
  const target = open?.target;
  const dialogRecovery = open?.recovery ?? restore;
  function closeDialog() {
    setOpen(null);
    setRestore(null);
    queueMicrotask(() => {
      const drawer = document.querySelector<HTMLElement>(
        '[data-shift-drawer] [role="dialog"]',
      );
      (
        action.current ?? drawer?.querySelector<HTMLButtonElement>("button")
      )?.focus();
    });
  }
  return (
    <div data-shift-drawer>
      <StaffShiftDrawer
        item={props.read.item}
        loading={props.read.loading}
        error={props.read.error}
        now={props.now}
        onClose={props.onClose}
        onRetry={props.onRetry}
        action={
          props.authorized &&
          props.read.item?.status === "ACTIVE" &&
          !props.read.loading &&
          !props.read.error ? (
            <div className={styles.actions}>
              <button
                ref={action}
                className={styles.primary}
                type="button"
                onClick={() =>
                  setOpen({ target: props.read.item!, recovery: null })
                }
              >
                {t.action}
              </button>
            </div>
          ) : null
        }
        dialog={
          target && props.authorized && !denied ? (
            <StaffForceEndDialog
              organizationId={props.organizationId}
              target={target}
              read={props.read}
              recovery={dialogRecovery}
              onClose={closeDialog}
              onDenied={props.onClose}
              onReconcile={props.onReconcile}
            />
          ) : null
        }
      />
    </div>
  );
}
