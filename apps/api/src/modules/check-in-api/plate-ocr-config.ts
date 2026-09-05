export interface PlateOcrConfig {
  readonly endpoint: string;
  readonly token: string;
  readonly minScore: number;
  readonly timeoutMs: number;
}

/** No cloud default. Missing or malformed configuration disables assistance. */
export function readPlateOcrConfig(
  env: NodeJS.ProcessEnv,
): PlateOcrConfig | undefined {
  try {
    const endpoint = new URL(env.PLATE_OCR_ENDPOINT ?? "");
    const token = env.PLATE_OCR_TOKEN;
    const score = env.PLATE_OCR_MIN_SCORE ?? "0.8";
    const timeout = env.PLATE_OCR_TIMEOUT_MS ?? "4000";
    if (
      !["https:", "http:"].includes(endpoint.protocol) ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash ||
      !token ||
      !/^[\x21-\x7e]{1,512}$/.test(token) ||
      !/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(score) ||
      !/^\d+$/.test(timeout)
    )
      return undefined;
    const minScore = Number(score);
    const timeoutMs = Number(timeout);
    if (!Number.isFinite(minScore) || timeoutMs < 100 || timeoutMs > 10_000)
      return undefined;
    return { endpoint: endpoint.toString(), token, minScore, timeoutMs };
  } catch {
    return undefined;
  }
}
