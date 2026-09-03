import {
  EmployeeApiError,
  EmployeeClient,
  employeeAuthenticationRequiredError,
  employeeNetworkError,
  type AcceptTaskResponse,
  type EmployeeOperationalTransport,
  type EmployeeTransport,
  type EmployeeTransportRequest,
  type NativeAuthSession,
  staffOperationalContextResponseSchema,
  type TaskQueueResponse,
} from "@valet/employee-client";

import {
  readNativeResponsePayload,
  validateNativeApiOrigin,
} from "../auth/native-api-http";

class NativeBearerTransport implements EmployeeTransport {
  private readonly apiOrigin: string;

  constructor(
    apiOrigin: string,
    private readonly accessToken: () => string | undefined,
    private readonly onResponse: (status: number) => void,
  ) {
    this.apiOrigin = validateNativeApiOrigin(apiOrigin);
  }

  async execute(request: EmployeeTransportRequest) {
    const accessToken = this.accessToken();
    if (accessToken === undefined) throw employeeAuthenticationRequiredError();
    const url = new URL(request.path, this.apiOrigin);
    for (const [key, value] of Object.entries(request.params ?? {})) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...request.headers,
    };
    if (request.body !== undefined)
      headers["Content-Type"] = "application/json";
    try {
      const response = await fetch(url.toString(), {
        ...(request.body === undefined
          ? {}
          : { body: JSON.stringify(request.body) }),
        credentials: "omit",
        headers,
        method: request.method,
      });
      this.onResponse(response.status);
      return {
        payload: await readNativeResponsePayload(response),
        status: response.status,
      };
    } catch (error) {
      if (error instanceof EmployeeApiError) throw error;
      throw employeeNetworkError();
    }
  }
}

function invalidResponse(): EmployeeApiError {
  return new EmployeeApiError({
    code: "NATIVE_OPERATIONAL_RESPONSE_INVALID",
    message: "The operational response was invalid.",
    status: 502,
  });
}

export function createNativeOperationalTransport(
  apiOrigin: string,
  auth: NativeAuthSession,
): EmployeeOperationalTransport {
  function request<T>(input: EmployeeTransportRequest): Promise<T> {
    const requestGeneration = auth.current().authGeneration;
    const isCurrent = () => auth.current().authGeneration === requestGeneration;
    let responseStatus: number | undefined;
    const client = new EmployeeClient({
      authorizationRecovery: {
        allowRefresh: true,
        onAuthorizationLoss: () => {
          if (responseStatus === 401 && isCurrent()) {
            void auth.handleDefinitiveAuthorizationLoss(requestGeneration);
          }
        },
        refreshAuthorization: async () => {
          if (!isCurrent()) return "definitive-failure";
          const result = await auth.refresh();
          if (!isCurrent()) return "definitive-failure";
          return result === "refreshed"
            ? "refreshed"
            : result === "transient-failure"
              ? "transient-failure"
              : "definitive-failure";
        },
      },
      transport: new NativeBearerTransport(
        apiOrigin,
        () => (isCurrent() ? auth.getAccessToken() : undefined),
        (status) => {
          responseStatus = status;
        },
      ),
    });
    return client.request<T>(input);
  }

  return {
    async acceptTask(taskId, expectedVersion) {
      return request<AcceptTaskResponse>({
        body: { expectedVersion },
        method: "POST",
        path: `/v1/staff/tasks/${taskId}/accept`,
      });
    },
    async loadOperationalContext() {
      const value = await request<unknown>({
        method: "GET",
        path: "/v1/staff/operational-context",
      });
      const parsed = staffOperationalContextResponseSchema.safeParse(value);
      if (!parsed.success) throw invalidResponse();
      return parsed.data;
    },
    async loadTaskQueue(locationId) {
      return request<TaskQueueResponse>({
        method: "GET",
        params: { locationId },
        path: "/v1/staff/tasks/queue",
      });
    },
  };
}
