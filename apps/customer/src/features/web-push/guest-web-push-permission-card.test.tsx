import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { guestWebPushCopy } from './guest-web-push-copy';
import { GuestWebPushPermissionPresentation } from './guest-web-push-permission-card';

describe('Guest Web Push permission presentation', () => {
  it('renders the approved English enable gesture without changing page direction', () => {
    const html = renderToStaticMarkup(
      <GuestWebPushPermissionPresentation
        copy={guestWebPushCopy('en')}
        direction="ltr"
        state="AVAILABLE"
        onDismiss={vi.fn()}
        onEnable={vi.fn()}
      />,
    );
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('Vehicle-ready notifications');
    expect(html).toContain('Enable notifications');
    expect(html).toContain('Not now');
  });

  it('renders denied/unsupported Arabic as truthful status without an enable control', () => {
    const html = renderToStaticMarkup(
      <GuestWebPushPermissionPresentation
        copy={guestWebPushCopy('ar')}
        direction="rtl"
        state="IOS_HOME_SCREEN_REQUIRED"
        onDismiss={vi.fn()}
        onEnable={vi.fn()}
      />,
    );
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('على iPhone، أضف التطبيق إلى الشاشة الرئيسية وافتحه من هناك، ثم فعّل الإشعارات.');
    expect(html).not.toContain('تفعيل الإشعارات');
    expect(html).toContain('ليس الآن');
  });
});
