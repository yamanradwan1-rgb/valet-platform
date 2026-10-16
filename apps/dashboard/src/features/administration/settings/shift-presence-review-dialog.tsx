"use client";
import { presenceId } from "./shift-presence-id";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePresenceDialogFocus } from "./use-presence-dialog-focus";
import { FocusDialog } from "../../../components/presentation/focus-dialog";
import { styles } from "../administration-ui";
import { useAuthoritativeRead } from "../use-authoritative-read";
import type { DashboardLocale } from "../../../lib/i18n/locale";
import type { PresenceApi } from "./shift-presence-api";
import type { PresenceMutation } from "./use-shift-presence-mutation";
import { presenceCopy } from "./shift-presence-copy";
import { ShiftPresenceExceptionFacts } from "./shift-presence-exception-facts";
import { PresenceReadFeedback } from "./shift-presence-list-ui";
import { PresenceMutationFeedback } from "./shift-presence-feedback";
import { usePresenceExpiry } from "./use-presence-expiry";
import { usePresenceForeground } from "./use-presence-foreground";
import { ScopedContextHelp } from "../../help/scoped-context-help";

export function ShiftPresenceReviewDialog(props: {
  readonly id: string;
  readonly generation: string;
  readonly api: PresenceApi;
  readonly mutation: PresenceMutation;
  readonly locale: DashboardLocale;
  readonly locationName: string;
  readonly disabled: boolean;
  readonly onClose: () => void;
}) {
  const t = presenceCopy(props.locale);
  const load = useCallback(
    (signal: AbortSignal) => props.api.exception(props.id, signal),
    [props.api, props.id],
  );
  const read = useAuthoritativeRead(
    `presence-review:${props.generation}`,
    load,
  );
  const canonical = props.mutation.canonical;
  usePresenceForeground(read.refresh);
  const focus = useRef<HTMLHeadingElement>(null);
  usePresenceDialogFocus(focus, props.mutation.blocked || read.loading);
  const data =
    canonical?.kind === "EXCEPTION" &&
    canonical.value.exceptionId === props.id &&
    canonical.value.revision >= (read.data?.revision ?? 0)
      ? canonical.value
      : read.data;
  const [reviewedRevision, setReviewedRevision] = useState<number | null>(null);
  const [submittedRevision, setSubmittedRevision] = useState<number | null>(
    null,
  );
  useEffect(() => {
    if (!data) return;
    let retired = false;
    queueMicrotask(() => {
      if (!retired) setSubmittedRevision((value) => value ?? data.revision);
    });
    return () => {
      retired = true;
    };
  }, [data]);
  const now = usePresenceExpiry(
    data?.status === "PENDING" ? [data.expiresAt] : [],
    read.refresh,
  );
  const expired = data !== null && Date.parse(data.expiresAt) <= now;
  const conflict =
    data !== null &&
    submittedRevision !== null &&
    submittedRevision !== data.revision &&
    reviewedRevision !== data.revision;
  const allowed =
    !props.disabled &&
    data?.status === "PENDING" &&
    data.canReview &&
    !expired &&
    !read.loading &&
    !read.error &&
    !props.mutation.blocked &&
    !conflict;
  async function review(action: "approve" | "reject") {
    if (!data || !allowed || Date.parse(data.expiresAt) <= Date.now()) return;
    setSubmittedRevision(data.revision);
    const mutationId = presenceId();
    const committed = await props.mutation.run(
      { mutationId, query: { kind: "EXCEPTION", entityId: props.id } },
      async () => ({
        kind: "EXCEPTION",
        value: await props.api.review(props.id, action, {
          mutationId,
          expectedRevision: data.revision,
        }),
      }),
    );
    if (committed) props.onClose();
  }
  return (
    <FocusDialog label={t("reviewTitle")} onClose={props.onClose}>
      <h2 ref={focus} className={styles.dialogTitle}>
        {t("reviewTitle")}
      </h2>
      <PresenceMutationFeedback
        mutation={props.mutation}
        locale={props.locale}
      />
      <PresenceReadFeedback
        locale={props.locale}
        {...read}
        onRefresh={read.refresh}
      />
      {data && !read.error ? (
        <>
          <ShiftPresenceExceptionFacts
            data={data}
            locale={props.locale}
            locationName={props.locationName}
          />
          <p className={styles.muted}>{t("approvalHelp")}</p>
          <p className={styles.muted}>{t("authorityHelp")}</p>
          {expired && data.status === "PENDING" ? (
            <p role="status">{t("expiredHint")}</p>
          ) : null}
          {conflict ? (
            <div className={styles.error} role="alert">
              <p>{t("conflict")}</p>
              <p>
                {t("previousValue")}: {submittedRevision} · {t("currentValue")}:{" "}
                {data.revision}
              </p>
              {data.canReview && data.status === "PENDING" && !expired ? (
                <button
                  className={styles.secondary}
                  disabled={props.mutation.blocked || read.loading}
                  onClick={() => setReviewedRevision(data.revision)}
                >
                  {t("reapply")}
                </button>
              ) : null}
            </div>
          ) : null}
          {data.canReview && data.status === "PENDING" ? (
            <>
              <p className={styles.muted}>{t("exceptionActionHelp")}</p>
              <div className={styles.formFooter}>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={!allowed}
                  onClick={() => void review("reject")}
                >
                  {t("reject")}
                </button>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={!allowed}
                  onClick={() => void review("approve")}
                >
                  {t("approve")}
                </button>
              </div>
            </>
          ) : (
            <p className={styles.muted}>{t("exceptionReadOnly")}</p>
          )}
        </>
      ) : null}
      <div className={styles.actions}>
        <button className={styles.secondary} onClick={props.onClose}>
          {t("close")}
        </button>
        <ScopedContextHelp helpKey="presence.review" />
      </div>
    </FocusDialog>
  );
}
