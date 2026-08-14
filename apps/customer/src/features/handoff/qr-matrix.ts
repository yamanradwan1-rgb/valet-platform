import QRCode from 'qrcode';

export const QR_QUIET_ZONE_MODULES = 4;

export interface QrMatrixResult {
  readonly coreModuleCount: number;
  readonly totalGridSize: number;
  readonly quietZone: number;
  readonly matrix: boolean[][];
}

export function computeQrMatrixWithQuietZone(
  payload: string,
  quietZone = QR_QUIET_ZONE_MODULES,
): QrMatrixResult | null {
  try {
    const qr = QRCode.create(payload, {
      errorCorrectionLevel: 'M',
    });
    const coreCount = qr.modules.size;
    const totalSize = coreCount + quietZone * 2;

    const fullMatrix: boolean[][] = [];
    for (let r = 0; r < totalSize; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < totalSize; c++) {
        const inCoreR = r >= quietZone && r < quietZone + coreCount;
        const inCoreC = c >= quietZone && c < quietZone + coreCount;
        if (inCoreR && inCoreC) {
          row.push(Boolean(qr.modules.get(r - quietZone, c - quietZone)));
        } else {
          row.push(false);
        }
      }
      fullMatrix.push(row);
    }

    return {
      coreModuleCount: coreCount,
      totalGridSize: totalSize,
      quietZone,
      matrix: fullMatrix,
    };
  } catch {
    return null;
  }
}
