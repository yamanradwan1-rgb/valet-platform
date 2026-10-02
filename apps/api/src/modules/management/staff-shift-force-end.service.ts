import { Inject, Injectable } from "@nestjs/common";
import type {
  StaffShiftForceEndRequest,
  StaffShiftForceEndResult,
} from "@valet/contracts";
import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { recordAdminActivityInTransaction } from "../auth/mfa/mfa-assurance-policy";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { authorizeStaffManagement } from "./staff-management-authorization";
import { forceEndStaffShift } from "./staff-shift-force-end-repository";

@Injectable()
export class StaffShiftForceEndService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  execute(
    context: StaffSessionContext,
    organizationId: string,
    shiftId: string,
    command: StaffShiftForceEndRequest,
  ): Promise<StaffShiftForceEndResult> {
    return inPostgresTransaction(this.pool, async (transaction) => {
      await authorizeStaffManagement(transaction, context, {
        organizationId,
        assurance: "SENSITIVE",
      });
      // SQL proves the persisted Shift's Location scope, independently of
      // staff-target complete coverage, before writes or replay disclosure.
      const result = await forceEndStaffShift(
        transaction,
        context,
        organizationId,
        shiftId,
        command,
      );
      await recordAdminActivityInTransaction(transaction, context);
      return result;
    });
  }
}
