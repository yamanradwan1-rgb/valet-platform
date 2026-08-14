import React from 'react';

import { SvgIcon } from './svg-icon';

export function IcCar({ className = '' }: { readonly className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M3 10.5 4.8 5.8A1.5 1.5 0 0 1 6.2 5h7.6a1.5 1.5 0 0 1 1.4 .8L17 10.5" />
      <rect x="1.5" y="10.5" width="17" height="5" rx="1.5" />
      <path d="M5 15.5v1M15 15.5v1" />
      <circle cx="5" cy="15.5" r="1.2" />
      <circle cx="15" cy="15.5" r="1.2" />
    </SvgIcon>
  );
}

export function IcWallet({ className = '' }: { readonly className?: string }) {
  return (
    <SvgIcon className={className}>
      <rect x="1.5" y="5" width="17" height="12" rx="2" />
      <path d="M1.5 9h17" />
      <circle cx="14.5" cy="13" r="1" fill="currentColor" stroke="none" />
    </SvgIcon>
  );
}

export function IcHelp({ className = '' }: { readonly className?: string }) {
  return (
    <SvgIcon className={className}>
      <circle cx="10" cy="10" r="8.5" />
      <path d="M7.8 7.8a2.5 2.5 0 0 1 4.9.6c0 1.8-2.5 2.5-2.5 4.2" />
      <circle cx="10" cy="15.2" r=".7" fill="currentColor" stroke="none" />
    </SvgIcon>
  );
}
