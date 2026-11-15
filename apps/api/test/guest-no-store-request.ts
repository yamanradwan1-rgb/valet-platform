interface GuestNoStoreRequestOptions {
  authorization?: string;
  body?: unknown;
}

export function createGuestNoStoreRequest(getBaseUrl: () => string) {
  return async function request(
    method: string,
    path: string,
    options: GuestNoStoreRequestOptions = {},
  ): Promise<{
    body: Record<string, unknown>;
    headers: Headers;
    status: number;
  }> {
    const headers: Record<string, string> = {};
    if (options.authorization !== undefined) {
      headers.authorization = options.authorization;
    }
    if (options.body !== undefined)
      headers["content-type"] = "application/json";
    const response = await fetch(`${getBaseUrl()}${path}`, {
      method,
      headers,
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    });
    return {
      body: (await response.json()) as Record<string, unknown>,
      headers: response.headers,
      status: response.status,
    };
  };
}
