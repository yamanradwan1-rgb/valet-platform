const API_READINESS_DEADLINE_MS = 3_000;
const MAX_READINESS_WAITERS = 128;

interface InFlightReadiness {
  readonly url: string;
  readonly fetcher: typeof fetch;
  readonly deadlineMs: number;
  readonly promise: Promise<boolean>;
  waiters: number;
}

let inFlight: InFlightReadiness | undefined;

function readinessUrl(): string | null {
  const rawOrigin = process.env.VAYLET_CUSTOMER_ARTIFACT_API_ORIGIN?.trim();
  if (!rawOrigin) return null;
  try {
    const origin = new URL(rawOrigin);
    if (
      origin.origin !== rawOrigin ||
      origin.username !== "" ||
      origin.password !== ""
    ) {
      return null;
    }
    return new URL("/health/ready", origin).toString();
  } catch {
    return null;
  }
}

export async function checkCustomerApiReadiness(
  fetcher: typeof fetch = fetch,
  deadlineMs = API_READINESS_DEADLINE_MS,
): Promise<boolean> {
  const url = readinessUrl();
  if (url === null || !Number.isInteger(deadlineMs) || deadlineMs <= 0) {
    return false;
  }
  // Do not queue work behind a different configuration or retain an
  // unbounded number of waiters for a hung upstream request.
  if (
    inFlight !== undefined &&
    (inFlight.url !== url ||
      inFlight.fetcher !== fetcher ||
      inFlight.deadlineMs !== deadlineMs)
  ) {
    return false;
  }
  const probe = inFlight ?? startReadinessProbe(url, fetcher, deadlineMs);
  if (probe.waiters >= MAX_READINESS_WAITERS) return false;
  probe.waiters += 1;
  try {
    // A runtime config change must not make a prior success authoritative.
    return (await probe.promise) && readinessUrl() === url;
  } finally {
    probe.waiters -= 1;
  }
}

function startReadinessProbe(
  url: string,
  fetcher: typeof fetch,
  deadlineMs: number,
): InFlightReadiness {
  const abort = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<boolean>((resolve) => {
    timeout = setTimeout(() => {
      abort.abort();
      resolve(false);
    }, deadlineMs);
  });
  const operation = (async () => {
    try {
      const response = await fetcher(url, {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
        redirect: "error",
        signal: abort.signal,
      });
      if (response.status !== 200) return false;
      const payload = (await response.json()) as unknown;
      return (
        typeof payload === "object" &&
        payload !== null &&
        "status" in payload &&
        payload.status === "ok"
      );
    } catch {
      return false;
    }
  })();
  const probe: InFlightReadiness = {
    url,
    fetcher,
    deadlineMs,
    waiters: 0,
    promise: Promise.race([operation, deadline]).finally(() => {
      if (timeout !== undefined) clearTimeout(timeout);
      if (inFlight === probe) inFlight = undefined;
    }),
  };
  inFlight = probe;
  return probe;
}
