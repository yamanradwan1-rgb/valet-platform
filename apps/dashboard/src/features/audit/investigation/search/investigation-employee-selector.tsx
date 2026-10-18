"use client";

import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
import type { InvestigationSelectorOption } from "./investigation-selector-resolution";
import searchStyles from "../../investigation-search.module.css";
import local from "../investigation-continuation.module.css";

interface Props {
  readonly locale: "ar" | "en";
  readonly label: string;
  readonly any: string;
  readonly value: string;
  readonly options: readonly InvestigationSelectorOption[];
  readonly oversized?: boolean | undefined;
  readonly loading?: boolean | undefined;
  readonly error?: string | null | undefined;
  readonly unpaged?: boolean | undefined;
  readonly page?: number | undefined;
  readonly hasNext?: boolean | undefined;
  readonly hasPrevious?: boolean | undefined;
  readonly onChange: (id: string) => void;
  readonly onRetain?: ((id: string) => void) | undefined;
  readonly onRefine?: ((prefix: string) => void) | undefined;
  readonly onNext?: (() => void) | undefined;
  readonly onPrevious?: (() => void) | undefined;
}

export function InvestigationEmployeeSelector(props: Props) {
  const selectId = useId();
  const prefixId = useId();
  const [prefix, setPrefix] = useState("");
  const [submitted, setSubmitted] = useState("");
  const ar = props.locale === "ar";
  const duplicates = new Set<string>();
  const names = new Set<string>();
  for (const option of props.options) {
    if (names.has(option.label)) duplicates.add(option.label);
    names.add(option.label);
  }
  function refine() {
    setSubmitted(prefix.trim());
    props.onRefine?.(prefix.trim());
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") { event.preventDefault(); refine(); }
  }
  function onSelect(event: FormEvent<HTMLSelectElement>) {
    const id = event.currentTarget.value;
    props.onRetain?.(id);
    props.onChange(id);
  }
  return (
    <div className={searchStyles.field}>
      <label htmlFor={selectId}>{props.label}</label>
      <select id={selectId} className={searchStyles.control}
        onChange={onSelect} value={props.value}>
        <option value="">{props.any}</option>
        {props.options.map((option) => (
          <option key={option.id} value={option.id}>
            {props.oversized || duplicates.has(option.label)
              ? `${option.label} · \u2068${option.id}\u2069` : option.label}
          </option>
        ))}
      </select>
      {props.oversized && (
        <div className={local.employeeTools}>
          <label htmlFor={prefixId}>
            {ar ? "تضييق البحث باسم الموظف" : "Refine employee name"}
          </label>
          <input id={prefixId} className={searchStyles.control}
            dir="auto" value={prefix} onChange={(e) => setPrefix(e.target.value)}
            onKeyDown={onKeyDown} maxLength={80} autoComplete="off" />
          <button type="button" className={searchStyles.secondaryButton}
            onClick={refine} disabled={props.loading}>
            {ar ? "تضييق البحث" : "Refine"}
          </button>
          {submitted && (
            <div className={local.optionNavigation}>
              <button type="button" className={searchStyles.secondaryButton}
                onClick={props.onPrevious} disabled={props.loading || !props.hasPrevious}>
                {ar ? "السابق" : "Previous"}
              </button>
              <span aria-live="polite">{ar ? "الصفحة" : "Page"} {props.page ?? 1}</span>
              <button type="button" className={searchStyles.secondaryButton}
                onClick={props.onNext} disabled={props.loading || !props.hasNext}>
                {ar ? "التالي" : "Next"}
              </button>
            </div>
          )}
          {props.unpaged && <small role="status">
            {ar ? "توجد خيارات إضافية؛ ضيّق الاسم أكثر للوصول إليها." :
              "More employees match; refine the name further to find them."}
          </small>}
          {props.error && <small role="alert">{props.error}</small>}
        </div>
      )}
    </div>
  );
}
