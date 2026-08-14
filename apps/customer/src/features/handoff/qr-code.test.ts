import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';

describe('Standards-compliant Dynamic QR generation', () => {
  it('generates a valid QR code matrix for authoritative payload', () => {
    const payload = 'vhq1.valet-session-12345.sig-67890';
    const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });

    expect(qr.modules.size).toBeGreaterThan(15);
    expect(typeof qr.modules.get(0, 0)).toBe('number');
    // Top-left finder pattern corner should be filled
    expect(qr.modules.get(0, 0)).toBe(1);
  });
});
