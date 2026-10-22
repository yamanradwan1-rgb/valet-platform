import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { GuestInformationResponse } from '@valet/contracts';

import { LocaleProvider } from '../../i18n/locale-provider';
import { GuestInformationContent } from './guest-information-content';

const privacy: GuestInformationResponse['privacy'] = {
  status: 'PUBLISHED', text: 'Location terms\nNever share your code',
  url: 'https://privacy.example.test/policy', version: 1,
  publishedAt: '2026-10-22T12:00:00.000Z',
};
const contact: GuestInformationResponse['contact'] = {
  displayName: 'Venue operations', phone: '+962791234567',
  supportUrl: 'https://help.example.test/contact', hours: 'Sun–Thu 08:00–17:00',
};

function render(section: 'privacy' | 'contact', information: GuestInformationResponse) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale={information.locale}>
      <GuestInformationContent section={section} information={information} />
    </LocaleProvider>,
  );
}

describe('#316 Guest information details', () => {
  it('shows only published privacy text and a safe external policy link', () => {
    const html = render('privacy', { locale: 'en', privacy, contact });
    expect(html).toContain('Location terms');
    expect(html).toContain('white-space:pre-wrap');
    expect(html).toContain('href="https://privacy.example.test/policy"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('shows localized unavailable states without inventing text, hours or URLs', () => {
    const emptyPrivacy: GuestInformationResponse['privacy'] = {
      status: 'UNAVAILABLE', text: null, url: null, version: null, publishedAt: null,
    };
    const emptyContact: GuestInformationResponse['contact'] = {
      displayName: null, phone: null, hours: null, supportUrl: null,
    };
    const model = { locale: 'ar' as const, privacy: emptyPrivacy, contact: emptyContact };
    expect(render('privacy', model)).toContain('لا توجد سياسة خصوصية منشورة');
    const content = render('contact', model);
    expect(content).toContain('بيانات التواصل غير متاحة');
    expect(content).not.toContain('href=');
  });

  it('shows only returned contact fields with a dial link', () => {
    const html = render('contact', { locale: 'en', privacy,
      contact: { ...contact, supportUrl: null, hours: null } });
    expect(html).toContain('Venue operations');
    expect(html).toContain('href="tel:+962791234567"');
    expect(html).not.toContain('Support website');
    expect(html).not.toContain('Contact hours');
  });
});
