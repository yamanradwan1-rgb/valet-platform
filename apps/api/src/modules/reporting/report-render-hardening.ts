export interface RenderedArtifact {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly filename: string;
}

export const maximumReportArtifactBytes = 5 * 1024 * 1024;

// Injection-hardening: strip non-tab/CR/LF C0 controls outright.
// eslint-disable-next-line no-control-regex -- injection hardening targets control characters
const controlStripPattern = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;
const leadingControlPattern = /^[\t\r\n]+/;
const dangerousPrefixPattern = /^[=+\-@\t\r\n]/;

function sanitizeCell(value: string): string {
  const stripped = value.replace(controlStripPattern, "");
  const withoutLeadingControls = stripped.replace(leadingControlPattern, "");
  return dangerousPrefixPattern.test(withoutLeadingControls)
    ? `'${withoutLeadingControls}`
    : withoutLeadingControls;
}

export function csvCell(value: string): string {
  const hardened = sanitizeCell(value);
  return /[",\r\n]/.test(hardened)
    ? `"${hardened.replaceAll('"', '""')}"`
    : hardened;
}

/**
 * Deterministic ASCII-safe representation for StandardFont (WinAnsi)
 * rendering: printable ASCII passes through, C0/DEL controls are removed,
 * and every other Unicode code point is preserved losslessly as a visible
 * code-point escape so distinct persisted values never collapse.
 */
export function pdfSafeText(text: string): string {
  let safe = "";
  for (const character of text) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint >= 0x20 && codePoint <= 0x7e) {
      safe += character;
    } else if (codePoint === 0x7f || codePoint < 0x20) {
      continue;
    } else {
      safe += "\\u{" + codePoint.toString(16) + "}";
    }
  }
  return safe;
}

export function reportArtifactWithinLimit(bytes: Uint8Array): boolean {
  return bytes.byteLength <= maximumReportArtifactBytes;
}
