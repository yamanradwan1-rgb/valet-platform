import {
  employeeNetworkError,
  type EmployeeTransport,
  type EmployeeTransportRequest,
  type EmployeeTransportResponse,
} from "@valet/employee-client";

interface EmployeeApiBrowserTransportOptions {
  readonly baseUrl: string;
  readonly getAccessToken: () => string | null;
  readonly requireAuth: boolean;
  readonly signal?: AbortSignal | undefined;
}

export class EmployeeApiBrowserTransport implements EmployeeTransport {
  constructor(private readonly options: EmployeeApiBrowserTransportOptions) {}

  async execute(
    request: EmployeeTransportRequest,
  ): Promise<EmployeeTransportResponse> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...request.headers,
    };
    const token = this.options.requireAuth
      ? this.options.getAccessToken()
      : null;
    if (token !== null) headers["Authorization"] = `Bearer ${token}`;
    if (request.body !== undefined)
      headers["Content-Type"] = "application/json";

    const init: RequestInit = {
      cache: "no-store",
      credentials: "include",
      headers,
      method: request.method,
    };
    if (this.options.signal !== undefined) init.signal = this.options.signal;
    if (request.body !== undefined) init.body = JSON.stringify(request.body);

    let response: Response;
    try {
      response = await fetch(this.buildUrl(request.path, request.params), init);
    } catch (error: unknown) {
      if (this.options.signal?.aborted) throw error;
      throw employeeNetworkError();
    }

    return {
      payload: await parseJsonPayload(response),
      status: response.status,
    };
  }

  private buildUrl(
    path: string,
    params?: EmployeeTransportRequest["params"],
  ): string {
    const fullPath = `${this.options.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    if (params === undefined) return fullPath;

    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }
    const query = searchParams.toString();
    return query.length > 0 ? `${fullPath}?${query}` : fullPath;
  }
}

async function parseJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
