"use client";

import type { ReactNode } from "react";

/**
 * Small shared form primitives for Map Setup editor sheets. Logical layout
 * only — every control mirrors correctly under RTL through the global
 * logical-CSS foundation.
 */

export interface TextFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly inputMode?: "decimal" | "text" | undefined;
  readonly error?: string | undefined;
  readonly placeholder?: string | undefined;
}

export function TextField({
  label,
  value,
  onChange,
  inputMode,
  error,
  placeholder,
}: TextFieldProps) {
  return (
    <div className="form-field">
      <label>
        {label}
        <input
          className="form-input"
          inputMode={inputMode}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
      </label>
      {error !== undefined && <p className="form-error">{error}</p>}
    </div>
  );
}

export interface SelectOption {
  readonly label: string;
  readonly value: string;
}

export interface SelectFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly SelectOption[];
}

export function SelectField({
  label,
  value,
  onChange,
  options,
}: SelectFieldProps) {
  return (
    <div className="form-field">
      <label>
        {label}
        <select
          className="form-input"
          onChange={(event) => onChange(event.target.value)}
          value={value}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export interface ToggleRowProps {
  readonly label: string;
  readonly activeLabel: string;
  readonly inactiveLabel: string;
  readonly value: boolean;
  readonly disabled?: boolean | undefined;
  readonly onChange: (value: boolean) => void;
}

export function ToggleRow({
  label,
  activeLabel,
  inactiveLabel,
  value,
  disabled,
  onChange,
}: ToggleRowProps) {
  return (
    <div className="map-setup-toggle-row">
      <span>{label}</span>
      <button
        type="button"
        aria-pressed={value}
        disabled={disabled === true}
        className={`map-setup-toggle${value ? " is-on" : ""}`}
        onClick={() => onChange(!value)}
      >
        {value ? activeLabel : inactiveLabel}
      </button>
    </div>
  );
}

export function SheetError({ message }: { message: string | null }) {
  if (message === null) return null;
  return (
    <p className="form-error" role="alert">
      {message}
    </p>
  );
}

export interface FormActionsProps {
  readonly cancelLabel: string;
  readonly submitLabel: string;
  readonly savingLabel: string;
  readonly saving: boolean;
  readonly disabled: boolean;
  readonly onCancel: () => void;
  readonly children?: ReactNode;
}

export function FormActions({
  cancelLabel,
  submitLabel,
  savingLabel,
  saving,
  disabled,
  onCancel,
  children,
}: FormActionsProps) {
  return (
    <div className="map-setup-form-actions">
      {children}
      <button type="button" className="btn-secondary" onClick={onCancel}>
        {cancelLabel}
      </button>
      <button
        type="submit"
        className="btn-primary"
        disabled={disabled || saving}
      >
        {saving ? savingLabel : submitLabel}
      </button>
    </div>
  );
}
