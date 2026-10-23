import { generate } from 'otplib';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import * as pdfRenderer from '../src/modules/management/company-report-pdf-renderer';
import { actor, event, fixture, latch, startLab, trace } from './dashboard-issue319-lab';

beforeAll(startLab, 180_000);
afterAll(() => fixture.stop(), 90_000);
afterEach(() => {
  vi.restoreAllMocks();
  if (trace.length) console.log('ISSUE319_COMPANY_EXPORT_FINALIZER_TRACE', JSON.stringify(trace.splice(0)));
});

describe('Issue #319 final gate: Company Report Export finalizer', () => {
  it('denies bytes and generation audit after recovery commits between RR and fresh finalizer',
    async () => {
      const a = await actor('ORG_ADMIN', false);
      const begun = await fixture.postMfa('/v1/staff/auth/mfa/enrollment/begin', a.auth.accessToken);
      expect(begun.status).toBe(200);
      const factorId = begun.body?.factorId as unknown;
      const secret = (begun.body?.provisioning as { secretBase32?: unknown } | undefined)?.secretBase32;
      if (typeof factorId !== 'string' || typeof secret !== 'string')
        throw new Error('Synthetic MFA enrollment unavailable.');
      const now = (await fixture.query<{ now: Date }>('SELECT clock_timestamp() AS now')).rows[0]!.now;
      const code = await generate({ algorithm: 'sha1', digits: 6,
        epoch: Math.floor(now.getTime() / 30_000) * 30, period: 30,
        secret, strategy: 'totp' });
      const confirmed = await fixture.postMfa('/v1/staff/auth/mfa/enrollment/confirm',
        a.auth.accessToken, { code, factorId });
      expect(confirmed.status).toBe(200);
      const recoveryCode = (confirmed.body?.recoveryCodes as unknown[] | undefined)?.[0];
      if (typeof recoveryCode !== 'string') throw new Error('Synthetic recovery code missing.');
      const recoverySession = await fixture.nativeLogin(a.user);
      expect(recoverySession.sessionId).not.toBe(a.auth.sessionId);
      await fixture.query('UPDATE locations SET timezone=$1 WHERE id=$2',
        ['Pacific/Chatham', a.locationId]);
      const path = `/v1/staff/management/organizations/${a.organizationId}/reports/exports`;
      const request = { date: '2026-07-10', format: 'PDF', kind: 'DAILY' };
      const baseline = await fixture.requestBytes(path, {
        authorization: `Bearer ${a.auth.accessToken}`, body: request, method: 'POST',
      });
      expect(baseline.status).toBe(200);
      expect(Buffer.from(baseline.bytes.slice(0, 5)).toString()).toBe('%PDF-');

      const entered = latch();
      const release = latch();
      const original = pdfRenderer.renderCompanyReportPdf;
      let intercepted = false;
      vi.spyOn(pdfRenderer, 'renderCompanyReportPdf').mockImplementation(async (...args) => {
        if (!intercepted) {
          intercepted = true;
          event('REPORT_EXPORT_RR_COMPLETED_RENDERER_ENTERED_BEFORE_FINALIZER');
          entered.resolve();
          await release.promise;
        }
        return original(...args);
      });

      const pending = fixture.requestBytes(path, {
        authorization: `Bearer ${a.auth.accessToken}`, body: request, method: 'POST',
      });
      let response: Awaited<typeof pending> | undefined;
      try {
        await Promise.race([entered.promise, new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Export post-RR renderer barrier missing.')), 7_000))]);
        const recovery = await fixture.postMfa('/v1/staff/auth/mfa/recovery/begin',
          recoverySession.accessToken, { recoveryCode });
        expect(recovery.status).toBe(200);
        const factor = await fixture.query<{ state: string }>(
          'SELECT state::text AS state FROM user_mfa_totp_factors WHERE id=$1', [factorId]);
        expect(factor.rows[0]?.state).toBe('RETIRED');
        event('CANONICAL_RECOVERY_COMMITTED_BEFORE_EXPORT_FINALIZER');
      } finally {
        release.resolve();
        response = await pending;
      }
      event(`REPORT_EXPORT_RESPONSE status=${response?.status} pdfHeader=${response?.headers.get('content-type')?.includes('application/pdf')}`);
      expect(response?.status).toBe(403);
      expect(response?.headers.get('content-type')).not.toContain('application/pdf');
      const audits = await fixture.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM audit_events WHERE organization_id=$1
         AND event_type='DASHBOARD_REPORT_EXPORT_GENERATED'`, [a.organizationId]);
      expect(audits.rows[0]?.count).toBe('1'); // Only the prior healthy baseline export.
      const fresh = await fixture.requestBytes(path, {
        authorization: `Bearer ${a.auth.accessToken}`, body: request, method: 'POST',
      });
      expect(fresh.status).toBe(403);
    }, 40_000);
});
