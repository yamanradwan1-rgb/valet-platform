"use client";

import type { ReactNode } from "react";

interface EmptyStateProps {
  message: string;
  children?: ReactNode;
}

export function EmptyState({ message, children }: EmptyStateProps) {
  return (
    <div className="empty-state" role="status">
      <p>{message}</p>
      {children !== undefined && (
        <div className="empty-state-actions">{children}</div>
      )}
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: (() => void) | undefined;
  retryLabel?: string | undefined;
}

export function ErrorState({ message, onRetry, retryLabel }: ErrorStateProps) {
  return (
    <div className="error-state" role="alert">
      <p>{message}</p>
      {onRetry !== undefined && retryLabel !== undefined && (
        <button type="button" className="btn-secondary" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </div>
  );
}
