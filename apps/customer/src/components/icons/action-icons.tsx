import React from 'react';

import { SvgIcon } from './svg-icon';

export function IcChevronRight({ className = '' }: { readonly className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M7.5 4.5l5 5.5-5 5.5" />
    </SvgIcon>
  );
}

export function IcChevronDown({ className = '' }: { readonly className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M4.5 7.5l5.5 5 5.5-5" />
    </SvgIcon>
  );
}

export function IcX({
  className = '',
  size = 20,
}: {
  readonly className?: string;
  readonly size?: number;
}) {
  return (
    <SvgIcon className={className} size={size}>
      <path d="M5 5l10 10M15 5 5 15" />
    </SvgIcon>
  );
}

export function IcMore({ className = '' }: { readonly className?: string }) {
  return (
    <SvgIcon className={className}>
      <circle cx="4" cy="10" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="10" cy="10" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="16" cy="10" r="1.2" fill="currentColor" stroke="none" />
    </SvgIcon>
  );
}

export function IcArrowLeft({ className = '' }: { readonly className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M13.5 10H6.5m0 0 3.5-3.5M6.5 10l3.5 3.5" />
    </SvgIcon>
  );
}

export function IcArrowRight({ className = '' }: { readonly className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M6.5 10h7m0 0-3.5-3.5M13.5 10l-3.5 3.5" />
    </SvgIcon>
  );
}

export function IcDownload({ className = '' }: { readonly className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M3.5 13.5v2a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-2" />
      <path d="M10 3v9m-3.5-3 3.5 3 3.5-3" />
    </SvgIcon>
  );
}

export function IcMail({ className = '' }: { readonly className?: string }) {
  return (
    <SvgIcon className={className}>
      <rect x="2" y="4.5" width="16" height="12" rx="1.5" />
      <path d="M2 6l8 6 8-6" />
    </SvgIcon>
  );
}

export function IcPhone({ className = '' }: { readonly className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M4 2.5h3.5l1.5 4-2.5 1.5A11 11 0 0 0 13.5 14l1.5-2.5 4 1.5V16.5a1.5 1.5 0 0 1-1.5 1.5C6.7 18 2 13.3 2 4A1.5 1.5 0 0 1 3.5 2.5H4z" />
    </SvgIcon>
  );
}

export function IcStar({
  className = '',
  filled = false,
  size = 20,
}: {
  readonly className?: string;
  readonly filled?: boolean;
  readonly size?: number;
}) {
  return (
    <SvgIcon className={className} size={size}>
      <path
        d="M10 2l2.4 5H18l-4.5 3.5 1.8 5.5L10 12.5 4.7 16l1.8-5.5L2 7h5.6L10 2z"
        fill={filled ? 'currentColor' : 'none'}
      />
    </SvgIcon>
  );
}

export function IcRefresh({ className = '' }: { readonly className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M4 10a6 6 0 1 1 1.5 4" />
      <path d="M4 14v-4h4" />
    </SvgIcon>
  );
}

export function IcCamera({ className = '' }: { readonly className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M1.5 6.5A1.5 1.5 0 0 1 3 5h1.5L6 3h8l1.5 2H17a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 17 17H3a1.5 1.5 0 0 1-1.5-1.5v-9z" />
      <circle cx="10" cy="11" r="3" />
    </SvgIcon>
  );
}

export function IcLanguage({ className = '' }: { readonly className?: string }) {
  return (
    <SvgIcon className={className}>
      <circle cx="10" cy="10" r="8.5" />
      <path d="M10 1.5c-2.5 2-4 4.8-4 8.5s1.5 6.5 4 8.5" />
      <path d="M10 1.5c2.5 2 4 4.8 4 8.5s-1.5 6.5-4 8.5" />
      <path d="M1.5 10h17" />
    </SvgIcon>
  );
}

export function IcPrivacy({ className = '' }: { readonly className?: string }) {
  return (
    <SvgIcon className={className}>
      <rect x="3" y="8.5" width="14" height="9" rx="1.5" />
      <path d="M6.5 8.5V6a3.5 3.5 0 0 1 7 0v2.5" />
    </SvgIcon>
  );
}

export function IcQR({ className = '' }: { readonly className?: string }) {
  return (
    <SvgIcon className={className}>
      <rect x="2" y="2" width="7" height="7" rx="1" />
      <rect x="11" y="2" width="7" height="7" rx="1" />
      <rect x="2" y="11" width="7" height="7" rx="1" />
      <rect x="4" y="4" width="3" height="3" fill="currentColor" stroke="none" />
      <rect x="13" y="4" width="3" height="3" fill="currentColor" stroke="none" />
      <rect x="4" y="13" width="3" height="3" fill="currentColor" stroke="none" />
      <path d="M13 13h1.5v1.5M13 16.5h4v-3M16.5 13v1.5" />
    </SvgIcon>
  );
}
