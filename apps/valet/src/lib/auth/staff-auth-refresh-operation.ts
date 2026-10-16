import { staffAuthAccessResponseSchema, type StaffAuthAccessResponse } from "@valet/contracts";
import { EmployeeApiError, normalizeEmployeeApiError } from "../api/employee-api-errors";
import { classifyRefreshFailure, StaffAuthRefreshError } from "./staff-auth-recovery";
import { executeStaffAuthFetch, parseStaffAuthJsonPayload } from "./staff-auth-transport";

/** The network and error-classification half of an HttpOnly-cookie refresh. */
export async function performStaffAuthRefreshRequest(
  baseUrl: string,
  onAccepted: (response: StaffAuthAccessResponse) => void,
  onDefinitiveRejection: () => void,
): Promise<StaffAuthAccessResponse> {
  try {
    const response = await executeStaffAuthFetch(`${baseUrl}/v1/staff/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({}),
      credentials: "include",
      cache: "no-store",
    });
    const payload = await parseStaffAuthJsonPayload(response);
    if (!response.ok) {
      const normalized = normalizeEmployeeApiError(
        response.status, payload, "Staff session refresh failed.",
      );
      const kind = classifyRefreshFailure(normalized);
      if (kind === "definitive") onDefinitiveRejection();
      throw new StaffAuthRefreshError(kind, normalized);
    }
    const accessResponse = staffAuthAccessResponseSchema.parse(payload);
    onAccepted(accessResponse);
    return accessResponse;
  } catch (error: unknown) {
    if (error instanceof StaffAuthRefreshError) throw error;
    const normalized = error instanceof EmployeeApiError
      ? error
      : new EmployeeApiError({
          code: "NETWORK_ERROR",
          isNetworkError: true,
          message: "Network connection unavailable. Please check your internet connection.",
          status: 0,
        });
    throw new StaffAuthRefreshError(classifyRefreshFailure(normalized), normalized);
  }
}
