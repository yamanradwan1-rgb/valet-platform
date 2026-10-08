const API_READINESS_DEADLINE_MS = 3_000;

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
  if (url === null) return false;
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
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
