"use client";

import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <section className={`card ${className ?? ""}`.trim()}>{children}</section>
  );
}

interface SectionHeaderProps {
  title: string;
  action?: ReactNode;
}

export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <div className="card-section-header">
      <h2>{title}</h2>
      {action !== undefined && (
        <div className="card-section-action">{action}</div>
      )}
    </div>
  );
}
