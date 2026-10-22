import type { ReactNode } from "react";
import type { ContactField, GuestLanguage } from "./guest-information-model";

export function translate(locale: GuestLanguage, en: string, ar: string): string {
  return locale === "ar" ? ar : en;
}

export const fieldLabels: Readonly<Record<ContactField, readonly [string, string]>> = {
  displayName: ["Public display name", "الاسم الظاهر للضيف"],
  phone: ["Public phone", "رقم الهاتف العام"],
  supportUrl: ["HTTPS support link", "رابط الدعم HTTPS"],
  hours: ["Support hours (if confirmed)", "ساعات الدعم (عند التأكيد)"],
};

export function GuestCard({
  children, title, subtitle, extra,
}: {
  readonly children: ReactNode;
  readonly title: string;
  readonly subtitle: string;
  readonly extra?: ReactNode;
}) {
  return (
    <section className="v-card">
      <div className="v-card-head">
        <div><h2>{title}</h2><p>{subtitle}</p></div>
        {extra}
      </div>
      <div className="v-card-body">{children}</div>
    </section>
  );
}

export function GuestBadge({
  children, kind,
}: {
  readonly children: ReactNode;
  readonly kind: "good" | "warn" | "neutral";
}) {
  return <span className={`v-badge v-badge-${kind}`}>{children}</span>;
}

export function GuestButton({
  children, onClick, kind = "secondary", disabled, ...attributes
}: {
  readonly children: ReactNode;
  readonly onClick: () => void;
  readonly kind?: "primary" | "secondary" | "quiet" | "active";
  readonly disabled?: boolean;
  readonly "aria-expanded"?: boolean;
  readonly "aria-controls"?: string;
  readonly "aria-pressed"?: boolean;
}) {
  return (
    <button className={`v-btn v-btn-${kind}`} type="button"
      disabled={disabled} onClick={onClick} {...attributes}>
      {children}
    </button>
  );
}

export function GuestField({
  field, locale, value, prefix, onChange, invalid = false,
}: {
  readonly field: ContactField;
  readonly locale: GuestLanguage;
  readonly value: string;
  readonly prefix: "company" | "override";
  readonly onChange: (next: string) => void;
  readonly invalid?: boolean;
}) {
  const id = `demo-${prefix}-${field}`;
  return (
    <div className="v-field">
      <label htmlFor={id}>{translate(locale, ...fieldLabels[field])}</label>
      <input id={id} autoComplete="off" value={value} aria-invalid={invalid}
        data-field={`${prefix}.${field}`}
        placeholder={translate(locale, "Not configured", "غير مُعدّ")}
        onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
