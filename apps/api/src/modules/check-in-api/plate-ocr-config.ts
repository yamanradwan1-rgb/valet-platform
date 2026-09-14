export interface PlateOcrConfig {
  readonly endpoint: string;
  readonly token: string;
  readonly minScore: number;
  readonly timeoutMs: number;
}

export type PlateOcrConfigIssue =
  | "provider-config-missing"
  | "provider-config-invalid"
  | "provider-endpoint-invalid";

export type PlateOcrConfigResolution =
  | { readonly status: "configured"; readonly config: PlateOcrConfig }
  | { readonly status: "unavailable"; readonly reason: PlateOcrConfigIssue };

/** No cloud default. Missing or malformed configuration disables assistance. */
export function resolvePlateOcrConfig(
  env: NodeJS.ProcessEnv,
): PlateOcrConfigResolution {
  const endpointValue = env.PLATE_OCR_ENDPOINT;
  const token = env.PLATE_OCR_TOKEN;
  if (!endpointValue)
    return { status: "unavailable", reason: "provider-config-missing" };
  try {
    const endpoint = new URL(endpointValue);
    if (
      !["https:", "http:"].includes(endpoint.protocol) ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash
    )
      return { status: "unavailable", reason: "provider-endpoint-invalid" };
    if (!token)
      return { status: "unavailable", reason: "provider-config-missing" };
    const score = env.PLATE_OCR_MIN_SCORE ?? "0.8";
    const timeout = env.PLATE_OCR_TIMEOUT_MS ?? "4000";
    if (
      !/^[\x21-\x7e]{1,512}$/.test(token) ||
      !/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(score) ||
      !/^\d+$/.test(timeout)
    )
      return { status: "unavailable", reason: "provider-config-invalid" };
    const minScore = Number(score);
    const timeoutMs = Number(timeout);
    if (!Number.isFinite(minScore) || timeoutMs < 100 || timeoutMs > 10_000)
      return { status: "unavailable", reason: "provider-config-invalid" };
    return {
      status: "configured",
      config: { endpoint: endpoint.toString(), token, minScore, timeoutMs },
    };
  } catch {
    return { status: "unavailable", reason: "provider-endpoint-invalid" };
  }
}

export function readPlateOcrConfig(
  env: NodeJS.ProcessEnv,
): PlateOcrConfig | undefined {
  const resolution = resolvePlateOcrConfig(env);
  return resolution.status === "configured" ? resolution.config : undefined;
}
