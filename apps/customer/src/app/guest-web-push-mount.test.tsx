import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { GuestSafeSession } from '../lib/api/guest-api-types';

vi.mock('../features/web-push/guest-web-push-permission-card', () => ({
  GuestWebPushPermissionCard: () => <span>push-permission</span>,
}));

const { GuestWebPushMount } = await import('./guest-web-push-mount');

function session(overrides: Partial<GuestSafeSession> = {}): GuestSafeSession {
  return {
    valetSessionId: '123e4567-e89b-12d3-a456-426614174000',
    state: 'PARKED',
    readyAt: null,
    guestVehicleReadyNotificationEnabled: true,
    vehicle: { make: 'Toyota', model: 'Camry', color: 'Black' },
    ...overrides,
  };
}

describe('production Guest Web Push mount gate', () => {
  it('mounts only an authoritative pre-READY visit when policy is affirmatively enabled', () => {
    expect(renderToStaticMarkup(<GuestWebPushMount enabled session={session()} />)).toContain('push-permission');
    expect(renderToStaticMarkup(<GuestWebPushMount enabled={false} session={session()} />)).toBe('');
    expect(renderToStaticMarkup(<GuestWebPushMount enabled session={session({ guestVehicleReadyNotificationEnabled: false })} />)).toBe('');
    expect(renderToStaticMarkup(<GuestWebPushMount enabled session={session({ guestVehicleReadyNotificationEnabled: undefined })} />)).toBe('');
    expect(renderToStaticMarkup(<GuestWebPushMount enabled session={session({ readyAt: '2026-10-08T12:00:00.000Z', state: 'READY' })} />)).toBe('');
  });

  it('is mounted after freshness handling in the authoritative live root', () => {
    const source = fs.readFileSync(path.resolve(__dirname, './guest-app-root.tsx'), 'utf8');
    expect(source.indexOf('<GuestWebPushMount')).toBeGreaterThan(source.indexOf('<GuestFreshnessNotice'));
  });
});
