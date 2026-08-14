'use client';

import React from 'react';

import { GuestAuthProvider } from '../features/auth/guest-auth-context';
import { GuestSessionProvider } from '../features/session/guest-session-provider';
import { GuestAppRoot } from './guest-app-root';

export default function Home() {
  return (
    <GuestAuthProvider>
      <GuestSessionProvider>
        <GuestAppRoot />
      </GuestSessionProvider>
    </GuestAuthProvider>
  );
}
