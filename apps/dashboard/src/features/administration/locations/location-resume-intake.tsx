"use client";

import { useState } from "react";
import type { ManagementLocationLifecycleResponse } from "@valet/contracts";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { FocusDialog } from "../../../components/presentation/focus-dialog";
import { administrationCopy } from "../administration-copy";
import { styles } from "../administration-ui";
import { SensitiveMfaDialog } from "../sensitive-mfa-dialog";
import { useSensitiveMutation } from "../use-sensitive-mutation";
import { locationResumeCopy } from "./location-resume-copy";
import { locationResumeError } from "./location-resume-error";
import { commandLocationLifecycle } from "./locations-api";

export function LocationResumeIntake(props: {
  readonly api: DashboardApiClient;
  readonly location: ManagementLocationLifecycleResponse;
  readonly organizationId: string;
  readonly onReload: () => void;
  readonly refreshing?: boolean;
}) {
  const { locale } = useDashboardLocale();
  const t = administrationCopy(locale);
  const r = locationResumeCopy(locale);
  const key = `${props.organizationId}:${props.location.locationId}`;
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [successKey, setSuccessKey] = useState<string | null>(null);
  const mutation = useSensitiveMutation(`resume-intake:${key}`, props.onReload);
  if (props.location.status !== "ACTIVE" || props.location.acceptingIntake)
    return null;
  const disabled =
    Boolean(props.refreshing) || mutation.busy || mutation.mfaOpen;
  const confirming = confirmKey === key;
  return (
    <>
      <button
        className={styles.secondary}
        type="button"
        disabled={disabled}
        onClick={() => setConfirmKey(key)}
      >
        {r.action}
      </button>
      {successKey === key ? <p role="status">{r.success}</p> : null}
      {confirming ? (
        <FocusDialog label={r.action} onClose={() => setConfirmKey(null)}>
          <h2 className={styles.dialogTitle}>{r.action}</h2>
          <div className={styles.stack}>
            <p>{r.confirm}</p>
            <bdi dir="auto">{props.location.name}</bdi>
            {mutation.busy ? <p role="status">{t.loading}</p> : null}
            {mutation.error ? (
              <div className={styles.error} role="alert">
                {mutation.error}
              </div>
            ) : null}
          </div>
          <div className={styles.formFooter}>
            <button
              className={styles.secondary}
              type="button"
              disabled={mutation.busy}
              onClick={() => setConfirmKey(null)}
            >
              {t.cancel}
            </button>
            <button
              className={styles.primary}
              type="button"
              disabled={disabled}
              onClick={() =>
                void mutation.run(
                  () =>
                    commandLocationLifecycle(
                      props.api,
                      props.organizationId,
                      props.location.locationId,
                      "resume-intake",
                      props.location.updatedAt,
                    ).catch((error: unknown) => {
                      throw locationResumeError(error, locale);
                    }),
                  () => {
                    setConfirmKey(null);
                    setSuccessKey(key);
                    props.onReload();
                  },
                )
              }
            >
              {r.action}
            </button>
          </div>
        </FocusDialog>
      ) : null}
      {mutation.mfaOpen ? (
        <SensitiveMfaDialog
          api={props.api}
          onAssured={mutation.onMfaAssured}
          onClose={mutation.closeMfa}
        />
      ) : null}
    </>
  );
}
