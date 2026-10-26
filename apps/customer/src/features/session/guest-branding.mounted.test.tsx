import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppShell } from '../../components/layout/app-shell';
import { BottomSheet } from '../../components/layout/bottom-sheet';
import { Btn } from '../../components/primitives/btn';
import { findElement, installTestDom, type TestElement, type TestNode } from '../../app/guest-refresh-mounted.test-host';
import { GuestApiClient } from '../../lib/api/guest-api-client';
import { GuestApiError } from '../../lib/api/api-error';
import type { GuestSafeSession } from '../../lib/api/guest-api-types';
import { GuestSessionProvider } from './guest-session-provider';
import { useGuestSession } from './use-guest-session';

const auth = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('../auth/guest-auth-context', () => ({ useGuestAuth: () => auth.current }));
vi.mock('../../i18n/use-translation', () => ({ useTranslation: () => ({
  t: (key: string) => key, direction: 'ltr', locale: 'en',
}) }));
let current: ReturnType<typeof useGuestSession>;
function Consumer() {
  const state = useGuestSession();
  useEffect(() => { current = state; }, [state]);
  return <><AppShell onMore={() => {}}><Btn>Primary</Btn></AppShell>
    <BottomSheet open onClose={() => {}} title="Sibling"><Btn>Continue</Btn></BottomSheet></>;
}
function Tree() { return <GuestSessionProvider><Consumer /></GuestSessionProvider>; }
const visit = (id: string, primaryColor: string): GuestSafeSession => ({
  valetSessionId: id, state: 'PARKED', readyAt: null,
  vehicle: { make: 'Toyota', model: 'Camry', color: 'White' },
  branding: { displayName: id, primaryColor },
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};
let root: Root;
let container: TestElement;
async function flush() { for (let i = 0; i < 10; i++) await Promise.resolve(); }
async function render() { await act(async () => { root.render(<Tree />); await flush(); }); }
function tokens(node: TestNode): unknown[] {
  const result: unknown[] = [];
  if ('style' in node) result.push((node as TestElement).style['--brand-primary']);
  for (const child of node.childNodes) result.push(...tokens(child));
  return result.filter(Boolean);
}
function expectColor(color: string | null) {
  expect(tokens(container)).toEqual(color ? [color, color] : []);
  expect(findElement(container, 'button', 'Primary').style.backgroundColor)
    .toBe('var(--brand-button-fill, var(--brand-primary, var(--v-blue)))');
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
  const dom = installTestDom();
  container = dom.document.createElement('div');
  dom.document.body.appendChild(container);
  root = createRoot(container as unknown as Element);
});
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); vi.restoreAllMocks(); });

it('applies company, override, clear and refresh projections atomically to shell and sibling sheet', async () => {
  const client = new GuestApiClient('fixture-a');
  auth.current = { client, isContextSwitchOutcomeAmbiguous: false };
  vi.spyOn(client, 'loadSession')
    .mockResolvedValueOnce(visit('location-a', '#00FF00'))
    .mockResolvedValueOnce(visit('location-a', '#8000FF'))
    .mockResolvedValueOnce(visit('location-a', '#00FF00'));
  await render(); expectColor('#00FF00');
  // Provider refresh uses the existing coalescing interval; advancing wall time
  // avoids adding artificial waits or changing production scheduling.
  const now = Date.now();
  vi.setSystemTime(now + 3000);
  await act(async () => { await current.refreshSession(); }); expectColor('#8000FF');
  vi.setSystemTime(now + 6000);
  await act(async () => { await current.refreshSession(); }); expectColor('#00FF00');
});

it.each(['other-location', 'other-organization'])('rejects late A after switching to %s and clears on expiry', async (scope) => {
  const clientA = new GuestApiClient('fixture-a');
  const clientB = new GuestApiClient('fixture-b');
  const delayed = deferred<GuestSafeSession>();
  vi.spyOn(clientA, 'loadSession').mockResolvedValueOnce(visit('a', '#00FF00'))
    .mockImplementationOnce(() => delayed.promise);
  vi.spyOn(clientB, 'loadSession').mockResolvedValueOnce(visit(scope, '#8000FF'))
    .mockRejectedValueOnce(new GuestApiError({ message: 'Expired', status: 401, code: 'GUEST_ACCESS_INVALID' }));
  auth.current = { client: clientA, isContextSwitchOutcomeAmbiguous: false };
  await render(); expectColor('#00FF00');
  let oldRead: Promise<void>;
  await act(async () => { oldRead = current.refreshSession(); await flush(); });
  auth.current = { client: clientB, isContextSwitchOutcomeAmbiguous: false };
  await render(); expectColor('#8000FF');
  await act(async () => { delayed.resolve(visit('a', '#00FF00')); await oldRead!; });
  expectColor('#8000FF');
  await act(async () => { await current.refreshSession(); });
  expect(current.isExpired).toBe(true); expectColor(null);
});

it('drops previous tokens during replacement loading, invalid projection and logout', async () => {
  const clientA = new GuestApiClient('fixture-a');
  const clientB = new GuestApiClient('fixture-b');
  const delayed = deferred<GuestSafeSession>();
  vi.spyOn(clientA, 'loadSession').mockResolvedValue(visit('a', '#00FF00'));
  vi.spyOn(clientB, 'loadSession').mockImplementation(() => delayed.promise);
  auth.current = { client: clientA }; await render(); expectColor('#00FF00');
  auth.current = { client: clientB }; await render(); expectColor(null);
  await act(async () => { delayed.resolve(visit('b', 'invalid')); await flush(); });
  expectColor(null);
  auth.current = { client: null }; await render(); expectColor(null);
});
