"use client";

interface SkeletonProps {
  lines?: number;
  label?: string;
}

export function Skeleton({ lines = 3, label }: SkeletonProps) {
  return (
    <div
      className="skeleton"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className="skeleton-line" />
      ))}
    </div>
  );
}

export function FullscreenLoader({ label }: { label: string }) {
  return (
    <div className="fullscreen-loader" role="status">
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}
