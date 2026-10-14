"use client";

import type { FormEvent } from "react";

import type { VisitContactCopy } from "./visit-contact-copy";
import type { VisitSearchMode } from "./visit-contacts-api";
import { ScopedContextHelp } from "../help/scoped-context-help";
import helpSlot from "../help/help-slot.module.css";
import baseStyles from "./visit-contacts.module.css";
import searchStyles from "./visit-contact-search.module.css";
const styles = { ...baseStyles, ...searchStyles };

export function VisitContactSearch(props: {
  readonly draft: {
    readonly name: string;
    readonly phone: string;
    readonly plate: string;
    readonly plateCountry: string;
  };
  readonly loading: boolean;
  readonly mode: VisitSearchMode;
  readonly onDraft: (next: {
    readonly name: string;
    readonly phone: string;
    readonly plate: string;
    readonly plateCountry: string;
  }) => void;
  readonly onMode: (mode: VisitSearchMode) => void;
  readonly onSubmit: () => void;
  readonly t: VisitContactCopy;
}) {
  const { draft, t } = props;
  function submit(event: FormEvent) {
    event.preventDefault();
    props.onSubmit();
  }
  return (
    <form className={`${styles.searchCard} ${helpSlot.anchor}`} onSubmit={submit}>
      <span className={helpSlot.searchCorner}><ScopedContextHelp helpKey="contacts.search" /></span>
      <div className={styles.searchRow}>
        <label className={`${styles.field} ${styles.searchField}`}>
          <span className={styles.label}>{t.searchMode}</span>
          <select
            aria-label={t.searchMode}
            className={styles.select}
            onChange={(event) =>
              props.onMode(event.target.value as VisitSearchMode)
            }
            value={props.mode}
          >
            <option value="NAME">{t.name}</option>
            <option value="PHONE">{t.phone}</option>
            <option value="PLATE">{t.plate}</option>
          </select>
        </label>
        {props.mode === "NAME" ? (
          <label className={`${styles.field} ${styles.searchField}`}>
            <span className={styles.label}>{t.name}</span>
            <input
              className={styles.input}
              maxLength={80}
              minLength={2}
              onChange={(event) =>
                props.onDraft({ ...draft, name: event.target.value })
              }
              placeholder={t.namePlaceholder}
              required
              value={draft.name}
            />
          </label>
        ) : null}
        {props.mode === "PHONE" ? (
          <label className={`${styles.field} ${styles.searchField}`}>
            <span className={styles.label}>{t.phone}</span>
            <input
              className={styles.input}
              dir="ltr"
              maxLength={40}
              minLength={1}
              onChange={(event) =>
                props.onDraft({ ...draft, phone: event.target.value })
              }
              placeholder={t.phonePlaceholder}
              required
              value={draft.phone}
            />
          </label>
        ) : null}
        {props.mode === "PLATE" ? (
          <div className={styles.plateFields}>
            <label className={`${styles.field} ${styles.searchField}`}>
              <span className={styles.label}>{t.plateCountry}</span>
              <input
                className={styles.input}
                dir="ltr"
                maxLength={8}
                onChange={(event) =>
                  props.onDraft({ ...draft, plateCountry: event.target.value })
                }
                placeholder={t.countryPlaceholder}
                required
                value={draft.plateCountry}
              />
            </label>
            <label className={`${styles.field} ${styles.searchField}`}>
              <span className={styles.label}>{t.plate}</span>
              <input
                className={styles.input}
                dir="ltr"
                maxLength={64}
                onChange={(event) =>
                  props.onDraft({ ...draft, plate: event.target.value })
                }
                placeholder={t.platePlaceholder}
                required
                value={draft.plate}
              />
            </label>
          </div>
        ) : null}
        <button
          className={styles.primary}
          disabled={props.loading}
          type="submit"
        >
          {props.loading ? t.searching : t.search}
        </button>
      </div>
    </form>
  );
}
