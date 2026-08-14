import React from 'react';

import { SvgIcon } from './svg-icon';

export function IcShieldCheck({ className = '' }: { readonly className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M10 2L3.5 5v5c0 4 3 7 6.5 8 3.5-1 6.5-4 6.5-8V5L10 2z" />
      <path d="M7 10l2 2 4-4" />
    </SvgIcon>
  );
}

export function IcCheck({ className = '' }: { readonly className?: string }) {
  return (
    <SvgIcon className={className}>
      <circle cx="10" cy="10" r="8.5" />
      <path d="M6.5 10l2.5 2.5 4.5-5" />
    </SvgIcon>
  );
}

export function IcClock({ className = '' }: { readonly className?: string }) {
  return (
    <SvgIcon className={className}>
      <circle cx="10" cy="10" r="8.5" />
      <path d="M10 5.5V10l3 2" />
    </SvgIcon>
  );
}

export function IcMapPin({ className = '' }: { readonly className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M10 1.5a6 6 0 0 1 6 6c0 4.5-6 11-6 11S4 12 4 7.5a6 6 0 0 1 6-6z" />
      <circle cx="10" cy="7.5" r="2" />
    </SvgIcon>
  );
}

export function IcAlert({ className = '' }: { readonly className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M10 2L1.5 17h17L10 2z" />
      <path d="M10 8v4" />
      <circle cx="10" cy="14" r=".7" fill="currentColor" stroke="none" />
    </SvgIcon>
  );
}

export function IcWifiOff({ className = '' }: { readonly className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M2.5 5A16 16 0 0 1 10 3c2.3 0 4.5.5 6.4 1.4" />
      <path d="M5.5 8a10 10 0 0 1 4.5-1.7" />
      <path d="M14 8.5A10 10 0 0 0 10 7" />
      <path d="M8 11.5A4 4 0 0 1 10 11" />
      <path d="M12 11.5a4 4 0 0 0-1.2-.4" />
      <circle cx="10" cy="14.5" r="1.2" fill="currentColor" stroke="none" />
      <line x1="2" y1="2" x2="18" y2="18" />
    </SvgIcon>
  );
}
