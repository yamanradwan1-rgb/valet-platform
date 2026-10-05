"use client";

import { useCallback, useEffect, useState } from "react";
import type { ShiftPresenceZone } from "@valet/contracts";
import { usePresenceForeground } from "./use-presence-foreground";
import { isPresenceDenied } from "./shift-presence-errors";
import { FocusDialog } from "../../../components/presentation/focus-dialog";
import { useAuthoritativeRead } from "../use-authoritative-read";
import { styles } from "../administration-ui";
import type { PresenceApi } from "./shift-presence-api";
import type { PresenceMutation } from "./use-shift-presence-mutation";
import type { DashboardLocale } from "../../../lib/i18n/locale";
import { presenceCopy } from "./shift-presence-copy";
import { ShiftPresenceZoneForm } from "./shift-presence-zone-form";

export interface ZoneDialogTarget {
  readonly id: string;
  readonly create: boolean;
  readonly mode: "edit" | "enable" | "disable";
  readonly generation: string;
}
export function ShiftPresenceZoneDialog(props: {
  readonly target: ZoneDialogTarget;
  readonly api: PresenceApi;
  readonly mutation: PresenceMutation;
  readonly locale: DashboardLocale;
  readonly canEdit: boolean;
  readonly onClose: () => void;
}) {
  const t = presenceCopy(props.locale);
  const load = useCallback(
    (signal: AbortSignal) => props.api.zone(props.target.id, signal),
    [props.api, props.target.id],
  );
  const read = useAuthoritativeRead(
    `presence-zone:${props.target.generation}`,
    load,
    !props.target.create,
  );
  const title = t(props.target.create ? "addZone" : "editZone");
  usePresenceForeground(read.refresh, !props.target.create);
  const [snapshot, setSnapshot] = useState<ShiftPresenceZone | null>(null);
  useEffect(() => {
    let retired = false;
    const zone = read.data?.zone;
    queueMicrotask(() => {
      if (retired) return;
      if (isPresenceDenied(read.error)) setSnapshot(null);
      else if (zone) setSnapshot(zone);
    });
    return () => {
      retired = true;
    };
  }, [read.data, read.error]);
  const zone = isPresenceDenied(read.error)
    ? null
    : (read.data?.zone ?? snapshot);
  return (
    <FocusDialog label={title} onClose={props.onClose}>
      <h2 className={styles.dialogTitle}>{title}</h2>
      {read.loading ? <p role="status">{t("loading")}</p> : null}
      {read.error ? (
        <div className={styles.error} role="alert">
          {t("failed")}
          <button className={styles.secondary} onClick={read.refresh}>
            {t("retry")}
          </button>
        </div>
      ) : null}
      {props.target.create || zone ? (
        <ShiftPresenceZoneForm
          zone={zone}
          zoneId={props.target.id}
          mode={props.target.mode}
          api={props.api}
          mutation={props.mutation}
          locale={props.locale}
          disabled={
            props.mutation.blocked ||
            !props.canEdit ||
            read.loading ||
            read.error !== null
          }
          onClose={props.onClose}
        />
      ) : (
        <button className={styles.secondary} onClick={props.onClose}>
          {t("cancel")}
        </button>
      )}
    </FocusDialog>
  );
}
