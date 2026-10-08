'use client';

import { createContext, useContext } from 'react';

import type { GuestSafeSession } from '../../lib/api/guest-api-types';
import type { GuestMutationTicket } from './guest-request-coordinator';
import type { GuestReadFailureKind } from './guest-read-error-classification';

export interface GuestSessionContextValue {
  readonly session: GuestSafeSession | null;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly isNetworkError: boolean;
  readonly failureKind: GuestReadFailureKind;
  readonly isExpired: boolean;
  readonly isRefreshing: boolean;
  readonly isFresh: boolean;
  readonly isStale: boolean;
  readonly isMutating: boolean;
  readonly cooldownSeconds: number;
  readonly beginMutation: () => GuestMutationTicket | null;
  readonly refreshSession: () => Promise<void>;
  readonly updateSession: (session: GuestSafeSession) => void;
}

export const GuestSessionContext = createContext<GuestSessionContextValue | null>(null);

export function useGuestSession(): GuestSessionContextValue {
  const context = useContext(GuestSessionContext);
  if (!context) {
    throw new Error('useGuestSession must be used within a GuestSessionProvider');
  }
  return context;
}
