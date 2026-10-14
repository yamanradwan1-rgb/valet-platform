import { Injectable } from "@nestjs/common";

import {
  AntiAbuseService,
  type AntiAbuseDecision,
} from "../anti-abuse/anti-abuse.service";

/** Durable, scope-separated rolling budgets; not the P1 per-User lease limit. */
@Injectable()
export class ConditionPhotoAdmission {
  constructor(private readonly antiAbuse: AntiAbuseService) {}

  async uploadStart(userId: string, sessionId: string): Promise<AntiAbuseDecision> {
    const user = this.antiAbuse.key("v1:condition-photo-upload-user", userId);
    const session = this.antiAbuse.key(
      "v1:condition-photo-upload-session",
      sessionId,
    );

    // Both independent limits are counted atomically: a rejected request
    // must not consume just one counter. Always acquire user then session.
    return await this.antiAbuse.transaction(async (transaction) => {
      const userBlocked = await this.antiAbuse.blockerInTransaction(
        transaction,
        user,
        20,
      );
      if (userBlocked !== undefined)
        return { allowed: false as const, retryAfter: userBlocked };

      const sessionBlocked = await this.antiAbuse.blockerInTransaction(
        transaction,
        session,
        60,
      );
      if (sessionBlocked !== undefined)
        return { allowed: false as const, retryAfter: sessionBlocked };

      await this.antiAbuse.countInTransaction(transaction, user, 20);
      await this.antiAbuse.countInTransaction(transaction, session, 60);
      return { allowed: true as const };
    });
  }

  async statusRead(userId: string): Promise<AntiAbuseDecision> {
    const key = this.antiAbuse.key("v1:condition-photo-status-user", userId);
    return await this.antiAbuse.count(key, 120);
  }
}
