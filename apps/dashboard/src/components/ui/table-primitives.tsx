"use client";

import type { ReactNode } from "react";

interface TableShellProps {
  headers: readonly string[];
  children: ReactNode;
  minWidth?: number | undefined;
}

/**
 * Desktop data-table shell with the D1 visual contract. Rows are passed as
 * children; mobile rendering uses MobileDataRow from the same primitive set.
 */
export function TableShell({ headers, children, minWidth }: TableShellProps) {
  return (
    <div className="table-scroll">
      <table
        className="data-table"
        style={minWidth === undefined ? undefined : { minWidth }}
      >
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

interface DataCellProps {
  children: ReactNode;
  mono?: boolean;
}

export function DataCell({ children, mono }: DataCellProps) {
  return (
    <td className={mono === true ? "cell-mono" : undefined}>{children}</td>
  );
}

interface MobileDataRowProps {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  fields: ReadonlyArray<{ label: string; value: string }>;
}

export function MobileDataRow({
  title,
  subtitle,
  trailing,
  fields,
}: MobileDataRowProps) {
  return (
    <div className="mobile-data-row">
      <div className="mobile-data-row-head">
        <div>
          <p className="mobile-data-row-title">{title}</p>
          {subtitle !== undefined && (
            <p className="mobile-data-row-subtitle">{subtitle}</p>
          )}
        </div>
        {trailing}
      </div>
      <dl className="mobile-data-fields">
        {fields.map((field) => (
          <div key={field.label} className="mobile-data-field">
            <dt>{field.label}</dt>
            <dd>{field.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
