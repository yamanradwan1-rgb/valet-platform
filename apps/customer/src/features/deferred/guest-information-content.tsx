import React from 'react';
import type { GuestInformationResponse } from '@valet/contracts';

import { useTranslation } from '../../i18n/use-translation';
import { C } from '../../lib/theme/colors';

export type GuestInformationSection = 'privacy' | 'contact';

const linkStyle: React.CSSProperties = {
  color: C.accent,
  fontSize: 14,
  fontWeight: 600,
  overflowWrap: 'anywhere',
};

function InformationField({
  label, value, href,
}: {
  readonly label: string;
  readonly value: string;
  readonly href?: string;
}) {
  return (
    <div style={{ padding: '12px 0', borderBottom: `1px solid ${C.borderSubtle}` }}>
      <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 6 }}>{label}</div>
      {href ? (
        <a href={href} target={href.startsWith('https:') ? '_blank' : undefined}
          rel={href.startsWith('https:') ? 'noopener noreferrer' : undefined}
          style={linkStyle}>{value}</a>
      ) : (
        <div style={{ fontSize: 14, lineHeight: 1.6, color: C.text,
          whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{value}</div>
      )}
    </div>
  );
}

export function GuestInformationContent({
  section, information,
}: {
  readonly section: GuestInformationSection;
  readonly information: GuestInformationResponse;
}) {
  const { t } = useTranslation();
  if (section === 'privacy') {
    const { privacy } = information;
    if (privacy.status !== 'PUBLISHED') {
      return <p role="status" style={{ color: C.textSecondary }}>{t('information.privacyUnavailable')}</p>;
    }
    return (
      <div>
        {privacy.text && (
          <div style={{ color: C.text, fontSize: 14, lineHeight: 1.7,
            whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{privacy.text}</div>
        )}
        {privacy.url && (
          <div style={{ marginTop: privacy.text ? 16 : 0 }}>
            <a href={privacy.url} target="_blank" rel="noopener noreferrer"
              style={linkStyle}>{t('information.fullPrivacyPolicy')}</a>
          </div>
        )}
      </div>
    );
  }

  const { contact } = information;
  if (!contact.displayName && !contact.phone && !contact.supportUrl && !contact.hours) {
    return <p role="status" style={{ color: C.textSecondary }}>{t('information.contactUnavailable')}</p>;
  }
  return (
    <div>
      {contact.displayName && <InformationField label={t('information.operator')}
        value={contact.displayName} />}
      {contact.phone && <InformationField label={t('information.phone')}
        value={contact.phone} href={`tel:${contact.phone}`} />}
      {contact.hours && <InformationField label={t('information.hours')}
        value={contact.hours} />}
      {contact.supportUrl && <InformationField label={t('information.supportSite')}
        value={t('information.openSupportSite')} href={contact.supportUrl} />}
    </div>
  );
}
