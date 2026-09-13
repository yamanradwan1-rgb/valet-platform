export interface StaffHarnessRequestOptions {
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  readonly token?: string;
}

export async function staffHarnessRequest<T>(
  baseUrl: string,
  method: string,
  path: string,
  options: StaffHarnessRequestOptions = {},
): Promise<{ body: T; status: number }> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.token !== undefined) {
    headers.authorization = `Bearer ${options.token}`;
  }
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    headers,
    method,
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  let body: unknown = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return { body: body as T, status: response.status };
}
