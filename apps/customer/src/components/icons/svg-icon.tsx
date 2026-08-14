import React from 'react';

export function SvgIcon({
  children,
  className = '',
  size = 20,
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly size?: number;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}
