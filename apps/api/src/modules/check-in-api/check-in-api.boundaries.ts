import { Injectable, UnauthorizedException } from "@nestjs/common";

export const STAFF_PRINCIPAL_RESOLVER = Symbol("STAFF_PRINCIPAL_RESOLVER");

export interface StaffPrincipal {
  readonly userId: string;
}

export interface StaffPrincipalResolver {
  resolve(authorization: string | undefined): Promise<StaffPrincipal>;
}

@Injectable()
export class FailClosedStaffPrincipalResolver implements StaffPrincipalResolver {
  async resolve(authorization: string | undefined): Promise<StaffPrincipal> {
    void authorization;
    throw new UnauthorizedException();
  }
}
