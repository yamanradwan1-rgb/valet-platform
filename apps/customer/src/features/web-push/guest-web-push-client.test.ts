import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  detectGuestWebPushCapability,
  enableGuestWebPush,
  readGuestWebPushCapability,
  type GuestWebPushCapabilitySnapshot,
  type GuestWebPushTransport,
} from './guest-web-push-client';

const supported = (overrides: Partial<GuestWebPushCapabilitySnapshot> = {}): GuestWebPushCapabilitySnapshot => ({
  displayModeStandalone: false,
  hasNotification: true,
  hasPushManager: true,
  hasServiceWorker: true,
  iosStandalone: null,
  isSecureContext: true,
  permission: 'default',
  ...overrides,
});

afterEach(() => vi.unstubAllGlobals());

function fakeSubscription() {
  return {
    toJSON: () => ({
      endpoint: 'https://push.example.test/subscription',
      expirationTime: null,
      keys: { auth: 'auth-key', p256dh: 'p256dh-key' },
    }),
    unsubscribe: vi.fn(async () => true),
  } as unknown as PushSubscription;
}

describe('Guest Web Push browser contract', () => {
  it('keeps iOS browser tabs foreground-only even if APIs are exposed', () => {
    expect(detectGuestWebPushCapability(supported({ iosStandalone: false })))
      .toBe('IOS_HOME_SCREEN_REQUIRED');
    expect(detectGuestWebPushCapability(supported({
      iosStandalone: true, displayModeStandalone: true,
    })))
      .toBe('AVAILABLE');
  });

  it('reads iOS Safari and Home Screen from platform capabilities, never user-agent text', () => {
    vi.stubGlobal('Notification', { permission: 'default' });
    vi.stubGlobal('PushManager', class PushManagerStub {});
    vi.stubGlobal('navigator', {
      serviceWorker: {}, standalone: false, userAgent: 'Android UA does not matter',
    });
    vi.stubGlobal('window', {
      isSecureContext: true,
      matchMedia: () => ({ matches: false }),
    });
    const safariTab = readGuestWebPushCapability();
    expect(safariTab).toMatchObject({ iosStandalone: false, displayModeStandalone: false });
    expect(detectGuestWebPushCapability(safariTab)).toBe('IOS_HOME_SCREEN_REQUIRED');

    vi.stubGlobal('navigator', {
      serviceWorker: {}, standalone: true, userAgent: 'Desktop spoof',
    });
    vi.stubGlobal('window', {
      isSecureContext: true,
      matchMedia: () => ({ matches: true }),
    });
    const homeScreen = readGuestWebPushCapability();
    expect(homeScreen).toMatchObject({ iosStandalone: true, displayModeStandalone: true });
    expect(detectGuestWebPushCapability(homeScreen)).toBe('AVAILABLE');
  });

  it('ignores iPhone UA spoofing and fails closed when platform signals are unknown', () => {
    vi.stubGlobal('Notification', { permission: 'default' });
    vi.stubGlobal('PushManager', class PushManagerStub {});
    vi.stubGlobal('navigator', {
      serviceWorker: {}, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 99_0 like Mac OS X)',
    });
    vi.stubGlobal('window', { isSecureContext: true });
    const unknown = readGuestWebPushCapability();
    expect(unknown).toMatchObject({ iosStandalone: null, displayModeStandalone: null });
    expect(detectGuestWebPushCapability(unknown)).toBe('UNSUPPORTED');
  });

  it('keeps a feature-capable non-iOS browser tab eligible without UA classification', () => {
    vi.stubGlobal('Notification', { permission: 'default' });
    vi.stubGlobal('PushManager', class PushManagerStub {});
    vi.stubGlobal('navigator', { serviceWorker: {}, userAgent: 'iPhone spoof' });
    vi.stubGlobal('window', {
      isSecureContext: true,
      matchMedia: () => ({ matches: false }),
    });
    const browser = readGuestWebPushCapability();
    expect(browser).toMatchObject({ iosStandalone: null, displayModeStandalone: false });
    expect(detectGuestWebPushCapability(browser)).toBe('AVAILABLE');
  });

  it('fails closed for denied permission and missing secure/browser capabilities', () => {
    expect(detectGuestWebPushCapability(supported({ permission: 'denied' }))).toBe('DENIED');
    expect(detectGuestWebPushCapability(supported({ isSecureContext: false }))).toBe('UNSUPPORTED');
    expect(detectGuestWebPushCapability(supported({ hasPushManager: false }))).toBe('UNSUPPORTED');
    expect(detectGuestWebPushCapability(supported({ displayModeStandalone: null }))).toBe('UNSUPPORTED');
    expect(detectGuestWebPushCapability(supported({
      iosStandalone: true, displayModeStandalone: false,
    }))).toBe('UNSUPPORTED');
  });

  it('keeps an explicitly dismissed browser permission prompt retryable without subscribing', async () => {
    const registerSubscription = vi.fn();
    const serviceWorkerReady = vi.fn();
    const result = await enableGuestWebPush({
      loadVapidPublicKey: vi.fn(), registerSubscription,
    }, 'en', undefined, {
      capability: () => supported(),
      requestPermission: vi.fn(async () => 'default' as NotificationPermission),
      serviceWorkerReady,
    });
    expect(result).toBe('AVAILABLE');
    expect(serviceWorkerReady).not.toHaveBeenCalled();
    expect(registerSubscription).not.toHaveBeenCalled();
  });

  it('fails closed when the Browser Session context changes during the permission gesture', async () => {
    const first = 'vgc1.11111111111111111111111111111111';
    const second = 'vgc1.22222222222222222222222222222222';
    const fakeDocument = { cookie: `__Host-vaylet_guest_context=${first}` };
    vi.stubGlobal('document', fakeDocument);
    await expect(enableGuestWebPush({
      loadVapidPublicKey: vi.fn(), registerSubscription: vi.fn(),
    }, 'en', undefined, {
      capability: () => supported(),
      requestPermission: vi.fn(async () => {
        fakeDocument.cookie = `__Host-vaylet_guest_context=${second}`;
        return 'granted' as NotificationPermission;
      }),
      serviceWorkerReady: vi.fn(),
    })).rejects.toMatchObject({ code: 'GUEST_CONTEXT_CHANGED' });
  });

  it('requests permission only when the explicit enable operation runs and registers no authority IDs', async () => {
    const subscription = fakeSubscription();
    const subscribe = vi.fn(async () => subscription);
    const requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
    const registerSubscription = vi.fn(async () => undefined);
    const transport: GuestWebPushTransport = {
      loadVapidPublicKey: vi.fn(async () => 'BEl6N3N1hXlJ2HtQ8LrT7t75cQ'),
      registerSubscription,
    };
    const pending = enableGuestWebPush(transport, 'ar', undefined, {
      capability: () => supported(),
      requestPermission,
      serviceWorkerReady: async () => ({
        pushManager: { getSubscription: async () => null, subscribe },
      }) as unknown as ServiceWorkerRegistration,
    });
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(await pending).toBe('ENABLED');
    expect(registerSubscription).toHaveBeenCalledWith({
      endpoint: 'https://push.example.test/subscription',
      auth: 'auth-key',
      locale: 'ar',
      p256dh: 'p256dh-key',
    }, undefined);
  });

  it('removes a newly-created browser subscription when server binding fails', async () => {
    const subscription = fakeSubscription();
    const transport: GuestWebPushTransport = {
      loadVapidPublicKey: vi.fn(async () => 'BEl6N3N1hXlJ2HtQ8LrT7t75cQ'),
      registerSubscription: vi.fn(async () => { throw new Error('unavailable'); }),
    };
    await expect(enableGuestWebPush(transport, 'en', undefined, {
      capability: () => supported({ permission: 'granted' }),
      requestPermission: vi.fn(),
      serviceWorkerReady: async () => ({
        pushManager: { getSubscription: async () => null, subscribe: async () => subscription },
      }) as unknown as ServiceWorkerRegistration,
    })).rejects.toThrow('unavailable');
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
