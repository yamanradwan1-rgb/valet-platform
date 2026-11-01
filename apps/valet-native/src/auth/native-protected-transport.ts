import {
  employeeAuthenticationRequiredError,
  employeeSessionServiceUnavailableError,
  shouldRefreshAndRetryEmployeeRequest,
  type EmployeeTransport,
  type EmployeeTransportRequest,
  type EmployeeTransportResponse,
  type NativeAuthSession,
} from "@valet/employee-client";

/** Request-local bearer fencing; auth recovery never replays a mutation. */
export class NativeProtectedTransport implements EmployeeTransport {
  private readonly generation: number;

  constructor(
    private readonly auth: NativeAuthSession,
    private readonly executeWithToken: (
      request: EmployeeTransportRequest,
      accessToken: string,
    ) => Promise<EmployeeTransportResponse>,
  ) {
    this.generation = auth.current().authGeneration;
  }

  async execute(
    request: EmployeeTransportRequest,
  ): Promise<EmployeeTransportResponse> {
    const accessToken = this.access();
    const response = await this.executeWithToken(request, accessToken);
    if (response.status !== 401 || !this.isCurrent()) return response;
    if (this.auth.current().phase === "restoration-unavailable") {
      // A delayed old request must not retry a refresh with unknown commit
      // outcome. DEC-072 retains explicit retry after transient failure.
      return this.transientResponse(request, response);
    }

    // A 401 rejects this access credential, not necessarily the refresh
    // session. Join current recovery, including for non-replayable commands.
    // A delayed response for an already-replaced bearer needs no new rotation.
    const recovery =
      this.auth.getAccessToken() !== undefined &&
      this.auth.getAccessToken() !== accessToken
        ? "refreshed"
        : await this.auth.refresh();
    if (!this.isCurrent()) return response;
    if (recovery === "transient-failure") {
      return this.transientResponse(request, response);
    }
    if (
      recovery !== "refreshed" ||
      !shouldRefreshAndRetryEmployeeRequest(request.method, 401, false)
    ) {
      return response;
    }

    const retryToken = this.access();
    // Even a second access rejection cannot identify refresh/session loss:
    // another rotation may have committed while its response is in flight.
    // Stop after one retry; only authoritative refresh failure purges auth.
    return this.executeWithToken(request, retryToken);
  }

  private isCurrent(): boolean {
    return this.auth.current().authGeneration === this.generation;
  }

  private transientResponse(
    request: EmployeeTransportRequest,
    response: EmployeeTransportResponse,
  ): EmployeeTransportResponse {
    if (request.method === "GET" || request.method === "HEAD") {
      throw employeeSessionServiceUnavailableError();
    }
    return response;
  }

  private access(): string {
    const token = this.isCurrent() ? this.auth.getAccessToken() : undefined;
    if (token === undefined) throw employeeAuthenticationRequiredError();
    return token;
  }
}
