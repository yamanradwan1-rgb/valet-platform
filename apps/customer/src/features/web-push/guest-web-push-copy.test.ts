import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { GUEST_WEB_PUSH_COPY, guestWebPushCopy } from './guest-web-push-copy';
import { GuestWebPushPermissionPresentation } from './guest-web-push-permission-presentation';

describe('Guest Web Push immutable UI copy', () => {
  it('pins the Owner-approved English copy', () => {
    expect(GUEST_WEB_PUSH_COPY.en).toEqual({
      notificationTitle: 'Your vehicle is ready',
      notificationBody: 'Your vehicle has arrived at the pickup area.',
      permissionTitle: 'Vehicle-ready notifications',
      permissionBody: 'Allow notifications so we can alert you when your vehicle is ready.',
      enable: 'Enable notifications',
      notNow: 'Not now',
      unavailable: 'Notifications are off. Check your vehicle status here for updates.',
      blockedTitle: 'Notifications are blocked',
      blockedBody: 'Your browser is blocking notifications. Enable them in browser settings to receive vehicle-ready alerts. You can always check your vehicle status here.',
      incompleteTitle: "Notifications aren't fully enabled",
      incompleteBody: 'Vehicle-ready alerts are not fully set up. Tap Enable notifications to try again, or check your vehicle status here.',
      iosHomeScreenRequired: 'On iPhone, add this app to your Home Screen, open it there, then enable notifications.',
    });
    expect(Object.isFrozen(GUEST_WEB_PUSH_COPY.en)).toBe(true);
  });

  it('pins the Owner-approved Arabic copy', () => {
    expect(GUEST_WEB_PUSH_COPY.ar).toEqual({
      notificationTitle: 'سيارتك جاهزة',
      notificationBody: 'وصلت مركبتك إلى منطقة الاستلام وهي جاهزة لك.',
      permissionTitle: 'إشعارات جاهزية المركبة',
      permissionBody: 'اسمح بالإشعارات لننبهك عندما تصبح مركبتك جاهزة.',
      enable: 'تفعيل الإشعارات',
      notNow: 'ليس الآن',
      unavailable: 'الإشعارات متوقفة. تحقّق من حالة مركبتك هنا لمعرفة التحديثات.',
      blockedTitle: 'الإشعارات محظورة',
      blockedBody: 'المتصفح حاجب الإشعارات. فعّلها من إعدادات المتصفح حتى تقدر تستقبل إشعار جاهزية سيارتك. وبتقدر دائمًا تتابع حالة سيارتك من هون.',
      incompleteTitle: 'تفعيل الإشعارات غير مكتمل',
      incompleteBody: 'إشعارات جاهزية سيارتك مش مفعّلة بالكامل. اضغط تفعيل الإشعارات للمحاولة مرة ثانية، أو تابع حالة سيارتك من هون.',
      iosHomeScreenRequired: 'على iPhone، أضف التطبيق إلى الشاشة الرئيسية وافتحه من هناك، ثم فعّل الإشعارات.',
    });
    expect(Object.isFrozen(GUEST_WEB_PUSH_COPY.ar)).toBe(true);
  });

  it.each(['en', 'ar'] as const)(
    'renders exact warnings, existing Btn tokens and frozen geometry in %s',
    (locale) => {
      const copy = guestWebPushCopy(locale);
      const direction = locale === 'ar' ? 'rtl' : 'ltr';
      const states = [
        ['DENIED', copy.blockedTitle, copy.blockedBody, false],
        ['UNSUPPORTED', copy.permissionTitle, copy.unavailable, false],
        ['IOS_HOME_SCREEN_REQUIRED', copy.permissionTitle, copy.iosHomeScreenRequired, false],
        ['SUBSCRIPTION_MISSING', copy.incompleteTitle, copy.incompleteBody, true],
        ['SERVER_BINDING_MISSING', copy.incompleteTitle, copy.incompleteBody, true],
        ['AVAILABLE', copy.permissionTitle, copy.permissionBody, true],
        ['FAILED', copy.permissionTitle, copy.unavailable, true],
        ['ENABLING', copy.permissionTitle, copy.permissionBody, true],
      ] as const;
      for (const [state, title, body, canEnable] of states) {
        const html = renderToStaticMarkup(
          React.createElement(GuestWebPushPermissionPresentation, {
            copy, direction, state,
            onDismiss: () => undefined,
            onEnable: () => undefined,
          }),
        );
        const decoded = html.replace(/&#x27;|&#39;/g, "'");
        expect(html).toContain(`dir="${direction}"`);
        expect(decoded).toContain(title);
        expect(decoded).toContain(body);
        expect(html).toContain('aria-live="polite"');
        expect(html).toMatch(/aria-labelledby="[^"]+"/);
        expect(html).toMatch(/aria-describedby="[^"]+"/);
        expect(html).toContain('var(--v-surface-raised)');
        expect(html).toContain('var(--v-border)');
        expect(html).toContain('bottom:88px');
        expect(html).toContain('max-width:390px');
        expect(html).toContain('padding:16px');
        expect(html).toContain('class="guest-action-focus"');
        expect((html.match(/<button\b/g) ?? []).length).toBe(canEnable ? 2 : 1);
      }
    },
  );

  it.each(['DENIED', 'UNSUPPORTED', 'IOS_HOME_SCREEN_REQUIRED',
    'SUBSCRIPTION_MISSING', 'SERVER_BINDING_MISSING', 'ENABLING'] as const)(
    'does not replace %s guidance with stale diagnostic feedback',
    (state) => {
      const html = renderToStaticMarkup(
        React.createElement(GuestWebPushPermissionPresentation, {
          copy: guestWebPushCopy('en'), direction: 'ltr', state,
          feedback: 'STALE FEEDBACK',
          onDismiss: () => undefined,
          onEnable: () => undefined,
        }),
      );
      expect(html).not.toContain('STALE FEEDBACK');
    },
  );
});
