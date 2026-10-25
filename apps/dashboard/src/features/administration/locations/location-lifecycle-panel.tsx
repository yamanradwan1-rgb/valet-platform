"use client";

import {
  managementLocationCurrencyCorrectionRequestSchema,
  managementLocationTimezoneCorrectionRequestSchema,
  type ManagementLocationLifecycleResponse,
} from "@valet/contracts";
import { useState } from "react";

import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { ScopedContextHelp } from "../../help/scoped-context-help";
import { administrationCopy } from "../administration-copy";
import { SensitiveMfaDialog } from "../sensitive-mfa-dialog";
import { styles } from "../administration-ui";
import { useSensitiveMutation } from "../use-sensitive-mutation";
import {
  commandLocationLifecycle,
  correctLocationCurrency,
  correctLocationTimezone,
} from "./locations-api";

import { LocationLifecycleFacts } from "./location-lifecycle-facts";
import { locationLifecycleExplanation } from "./location-lifecycle-explanation";

export function LocationLifecyclePanel(props: {
  readonly api: DashboardApiClient;
  readonly location: ManagementLocationLifecycleResponse;
  readonly onReload: () => void;
  readonly organizationId: string;
  readonly refreshing?: boolean;
}) {
  const { locale } = useDashboardLocale();
  const t = administrationCopy(locale);
  const explanation = locationLifecycleExplanation(props.location, locale);
  const [currency, setCurrency] = useState(props.location.currency);
  const [timezone, setTimezone] = useState(props.location.timezone);
  const [reason, setReason] = useState("");
  const [impact, setImpact] = useState(false);
  const [observedAt, setObservedAt] = useState(props.location.updatedAt);
  if (observedAt !== props.location.updatedAt) {
    setObservedAt(props.location.updatedAt);
    setCurrency(props.location.currency);
    setTimezone(props.location.timezone);
    setReason("");
  }
  const mutation = useSensitiveMutation(
    `location-lifecycle:${props.location.locationId}:${props.location.updatedAt}`,
    props.onReload,
  );
  async function timezoneCorrection() {
    setImpact(false);
    await mutation.run(
      () =>
        correctLocationTimezone(
          props.api,
          props.organizationId,
          props.location.locationId,
          {
            expectedUpdatedAt: props.location.updatedAt,
            newTimezone: timezone,
            reason,
          },
        ),
      (response) => {
        setImpact(
          !response.impact.historicalTimestampsRewritten &&
            !response.impact.historicalReportFactsRewritten,
        );
        props.onReload();
      },
    );
  }
  const currencyValid =
    managementLocationCurrencyCorrectionRequestSchema.safeParse({
      expectedUpdatedAt: props.location.updatedAt,
      newCurrency: currency,
    }).success;
  const timezoneValid =
    managementLocationTimezoneCorrectionRequestSchema.safeParse({
      expectedUpdatedAt: props.location.updatedAt,
      newTimezone: timezone,
      reason,
    }).success;
  const inactiveCorrectionAllowed =
    props.location.status === "INACTIVE" &&
    !props.location.acceptingIntake &&
    !props.location.drain.blocked;
  return (
    <fieldset
      className={styles.stack}
      disabled={props.refreshing}
      style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}
    >
      <LocationLifecycleFacts location={props.location} />
      <div className={styles.actions}>
        <ScopedContextHelp helpKey="locations.lifecycle" />
        {props.location.status === "INACTIVE" ? (
          <button
            className={styles.primary}
            aria-describedby={
              explanation ? "location-lifecycle-explanation" : undefined
            }
            title={explanation ?? undefined}
            disabled={
              mutation.busy || !props.location.readiness.readyForActivation
            }
            onClick={() =>
              void mutation.run(
                () =>
                  commandLocationLifecycle(
                    props.api,
                    props.organizationId,
                    props.location.locationId,
                    "activate",
                    props.location.updatedAt,
                  ),
                props.onReload,
              )
            }
            type="button"
          >
            {t.activateLocation}
          </button>
        ) : null}
        {props.location.acceptingIntake ? (
          <button
            className={styles.secondary}
            disabled={mutation.busy}
            onClick={() =>
              void mutation.run(
                () =>
                  commandLocationLifecycle(
                    props.api,
                    props.organizationId,
                    props.location.locationId,
                    "stop-intake",
                    props.location.updatedAt,
                  ),
                props.onReload,
              )
            }
            type="button"
          >
            {t.stopIntake}
          </button>
        ) : null}
        {props.location.status === "ACTIVE" &&
        !props.location.acceptingIntake ? (
          <button
            className={styles.danger}
            aria-describedby={
              explanation ? "location-lifecycle-explanation" : undefined
            }
            title={explanation ?? undefined}
            disabled={mutation.busy || props.location.drain.blocked}
            onClick={() =>
              void mutation.run(
                () =>
                  commandLocationLifecycle(
                    props.api,
                    props.organizationId,
                    props.location.locationId,
                    "deactivate",
                    props.location.updatedAt,
                  ),
                props.onReload,
              )
            }
            type="button"
          >
            {t.deactivateLocation}
          </button>
        ) : null}
      </div>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <label htmlFor="correct-currency">{t.correctCurrency}</label>
          <div className={styles.actions}>
            <input
              className={styles.input}
              dir="ltr"
              id="correct-currency"
              maxLength={3}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              value={currency}
            />
            <button
              className={styles.secondary}
              disabled={
                mutation.busy ||
                !inactiveCorrectionAllowed ||
                !currencyValid ||
                currency === props.location.currency
              }
              onClick={() =>
                void mutation.run(
                  () =>
                    correctLocationCurrency(
                      props.api,
                      props.organizationId,
                      props.location.locationId,
                      {
                        expectedUpdatedAt: props.location.updatedAt,
                        newCurrency: currency,
                      },
                    ),
                  props.onReload,
                )
              }
              type="button"
            >
              {t.save}
            </button>
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor="correct-timezone">{t.correctTimezone}</label>
          <input
            className={styles.input}
            dir="ltr"
            id="correct-timezone"
            maxLength={255}
            onChange={(e) => setTimezone(e.target.value)}
            value={timezone}
          />
          <label htmlFor="timezone-reason">{t.reason}</label>
          <textarea
            className={styles.textarea}
            id="timezone-reason"
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            value={reason}
          />
          <button
            className={styles.secondary}
            disabled={
              mutation.busy ||
              !inactiveCorrectionAllowed ||
              !timezoneValid ||
              timezone === props.location.timezone ||
              !reason.trim()
            }
            onClick={() => void timezoneCorrection()}
            type="button"
          >
            {t.save}
          </button>
        </div>
      </div>
      {impact ? (
        <div className={styles.cardPad}>
          <b>{t.historicalImpact}</b>
          <p className={styles.sectionText}>{t.historyUnchanged}</p>
        </div>
      ) : null}
      {explanation ? (
        <p id="location-lifecycle-explanation" className={styles.sectionText}>
          {explanation}
        </p>
      ) : null}
      {mutation.error ? (
        <div className={styles.error} role="alert">
          {mutation.error}
        </div>
      ) : null}
      {mutation.mfaOpen ? (
        <SensitiveMfaDialog
          api={props.api}
          onAssured={mutation.onMfaAssured}
          onClose={mutation.closeMfa}
        />
      ) : null}
    </fieldset>
  );
}
