import { describe, expect, it } from 'vitest';

import {
  computeQrMatrixWithQuietZone,
  QR_QUIET_ZONE_MODULES,
} from './qr-matrix';

describe('Standards-compliant Dynamic QR with Quiet Zone', () => {
  const payload = 'vhq1.b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d.sample-token-proof';

  it('generates a valid QR code matrix that includes exactly a 4-module quiet zone', () => {
    const result = computeQrMatrixWithQuietZone(payload, QR_QUIET_ZONE_MODULES);
    expect(result).not.toBeNull();

    if (!result) return;

    expect(result.quietZone).toBe(4);
    expect(result.totalGridSize).toBe(result.coreModuleCount + 8);
    expect(result.matrix.length).toBe(result.totalGridSize);
    expect(result.matrix[0]?.length).toBe(result.totalGridSize);

    // Verify all 4 top rows are quiet zone (all false/white)
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < result.totalGridSize; c++) {
        expect(result.matrix[r]?.[c]).toBe(false);
      }
    }

    // Verify all 4 bottom rows are quiet zone (all false/white)
    for (let r = result.totalGridSize - 4; r < result.totalGridSize; r++) {
      for (let c = 0; c < result.totalGridSize; c++) {
        expect(result.matrix[r]?.[c]).toBe(false);
      }
    }

    // Verify the core starts at offset (4, 4) and has the finder pattern corner module filled
    expect(result.matrix[4]?.[4]).toBe(true);
  });

  it('returns null safely for un-encodable payloads without crashing', () => {
    const invalidLongPayload = 'x'.repeat(10000);
    const result = computeQrMatrixWithQuietZone(invalidLongPayload);
    expect(result).toBeNull();
  });
});
