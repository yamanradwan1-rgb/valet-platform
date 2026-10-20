"use client";

import { investigationMinuteCandidates } from "../../investigation-live-timezone";
import searchStyles from "../../investigation-search.module.css";
import local from "../investigation-continuation.module.css";

interface Props {
  readonly locale: "ar" | "en";
  readonly date: string;
  readonly minute: string;
  readonly timezone: string;
  readonly value?: string | undefined;
  readonly onChange: (utc: string) => void;
  readonly describedBy: string;
}

export function InvestigationTimeDisambiguation(props: Props) {
  let options: ReturnType<typeof investigationMinuteCandidates>;
  try {
    options = investigationMinuteCandidates(props.date, props.minute, props.timezone);
  } catch (error) {
    const gap = error instanceof Error && error.message === "NONEXISTENT_LOCAL_TIME";
    if (!gap) return null;
    return <small id={props.describedBy} role="alert">
      {props.locale === "ar" ? "هذا الوقت المحلي غير موجود. صحّح الوقت." :
        "This local time does not exist. Correct the time."}
    </small>;
  }
  if (options.length === 1) return null;
  const ar = props.locale === "ar";
  return (
    <div className={local.foldChoice}>
      <label htmlFor={props.describedBy}>
        {ar ? "اختر تكرار الوقت" : "Choose time occurrence"}
      </label>
      <select id={props.describedBy} className={searchStyles.control}
        aria-required="true" required value={props.value ?? ""}
        onChange={(event) => props.onChange(event.target.value)}>
        <option value="">{ar ? "اختر الوقت" : "Choose occurrence"}</option>
        {options.map((option, index) => (
          <option value={option.utc} key={option.utc}>
            {index === 0 ? ar ? "التكرار الأول" : "First occurrence" :
              ar ? "التكرار الثاني" : "Second occurrence"} · {option.offset}
          </option>
        ))}
      </select>
    </div>
  );
}
