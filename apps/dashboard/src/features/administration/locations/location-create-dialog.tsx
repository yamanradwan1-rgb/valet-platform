"use client";

import { useState, type FormEvent } from "react";

import { FocusDialog } from "../../../components/presentation/focus-dialog";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { ScopedContextHelp } from "../../help/scoped-context-help";
import { administrationCopy } from "../administration-copy";
import { SensitiveMfaDialog } from "../sensitive-mfa-dialog";
import { styles } from "../administration-ui";
import { useSensitiveMutation } from "../use-sensitive-mutation";
import { createLocation } from "./locations-api";
import dialogStyles from "./locations-dialog.module.css";

export function LocationCreateDialog(props: {
  readonly api: DashboardApiClient;
  readonly onClose: () => void;
  readonly onCreated: (locationId: string) => void;
  readonly organizationId: string;
}) {
  const { locale } = useDashboardLocale();
  const t = administrationCopy(locale);
  const [operationId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [addressText, setAddressText] = useState("");
  const [timezone, setTimezone] = useState("");
  const [currency, setCurrency] = useState("");
  const mutation = useSensitiveMutation(
    `location-create:${props.organizationId}:${operationId}`,
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    await mutation.run(
      () =>
        createLocation(props.api, props.organizationId, {
          operationId,
          name,
          code,
          addressText,
          timezone,
          currency,
        }),
      (result) => props.onCreated(result.locationId),
    );
  }

  return (
    <div className={dialogStyles.host}>
      <FocusDialog label={t.createLocation} onClose={props.onClose}>
        <h2 className={styles.dialogTitle}>{t.createLocation}</h2>
        <form className={styles.stack} onSubmit={(event) => void submit(event)}>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label htmlFor="location-name">{t.name}</label>
              <input
                className={styles.input}
                id="location-name"
                maxLength={200}
                onChange={(e) => setName(e.target.value)}
                required
                value={name}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="location-code">{t.code}</label>
              <input
                className={styles.input}
                dir="ltr"
                id="location-code"
                maxLength={100}
                onChange={(e) => setCode(e.target.value)}
                required
                value={code}
              />
            </div>
          </div>
          <div className={styles.field}>
            <label htmlFor="location-address">{t.address}</label>
            <input
              className={styles.input}
              id="location-address"
              maxLength={1000}
              onChange={(e) => setAddressText(e.target.value)}
              required
              value={addressText}
            />
          </div>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label htmlFor="location-timezone">{t.timezone}</label>
              <input
                className={styles.input}
                dir="ltr"
                id="location-timezone"
                maxLength={255}
                onChange={(e) => setTimezone(e.target.value)}
                required
                value={timezone}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="location-currency">{t.currency}</label>
              <input
                className={styles.input}
                dir="ltr"
                id="location-currency"
                maxLength={3}
                pattern="[A-Z]{3}"
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                required
                value={currency}
              />
            </div>
          </div>
          {mutation.error ? (
            <div className={styles.error} role="alert">
              {mutation.error}
            </div>
          ) : null}
          <div className={styles.formFooter}>
            <ScopedContextHelp helpKey="locations.create" />
            <button
              className={styles.secondary}
              onClick={props.onClose}
              type="button"
            >
              {t.cancel}
            </button>
            <button
              className={styles.primary}
              disabled={mutation.busy}
              type="submit"
            >
              {t.createLocation}
            </button>
          </div>
        </form>
        {mutation.mfaOpen ? (
          <SensitiveMfaDialog
            api={props.api}
            onAssured={mutation.onMfaAssured}
            onClose={mutation.closeMfa}
          />
        ) : null}
      </FocusDialog>
    </div>
  );
}
