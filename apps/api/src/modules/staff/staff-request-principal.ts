import { UnauthorizedException } from "@nestjs/common";
import type { ApiRequest } from "../../common/http/api-request";
import type { StaffPrincipalResolver } from "../auth/staff-principal";

export async function resolveSingleStaffUserId(
  principals: StaffPrincipalResolver,
  request: ApiRequest,
  authorization: string | undefined,
): Promise<string> {
  const rawHeaders = request.rawHeaders;
  let count = 0;
  if (rawHeaders === undefined || rawHeaders.length % 2 !== 0) {
    throw new UnauthorizedException();
  }
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (rawHeaders[index]?.toLowerCase() === "authorization") count += 1;
  }
  if (count !== 1) throw new UnauthorizedException();
  return (await principals.resolve(authorization)).userId;
}

export function countRequestHeader(request: ApiRequest, name: string): number {
  const rawHeaders = request.rawHeaders ?? [];
  let count = 0;
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (rawHeaders[index]?.toLowerCase() === name.toLowerCase()) count += 1;
  }
  return count;
}
