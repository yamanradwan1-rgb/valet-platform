import { Injectable } from "@nestjs/common";

import { AntiAbuseService } from "../anti-abuse/anti-abuse.service";

function rateLimited(retryAfter?: number): never {
  throw Object.assign(new Error("Too many photo requests. Try again later."), {
    code: "DASHBOARD_SESSION_PHOTO_RATE_LIMITED",
    ...(typeof retryAfter === "number" && Number.isFinite(retryAfter) &&
      retryAfter >= 1 && retryAfter <= 900 ? { retryAfter } : {}),
  });
}

/**
 * Independent Management-view budget; it MUST NOT consume the employee
 * Check-In upload/status budget. Backed by the existing durable PG anti-abuse
 * clock, so request counts survive process restarts.
 */
@Injectable()
export class DashboardSessionPhotoAdmission {
  private readonly concurrentByUser = new Map<string, number>();
  private globalConcurrent = 0;

  constructor(private readonly abuse: AntiAbuseService) {}

  async admit(userId: string): Promise<void> {
    const key = this.abuse.key("v1:dashboard-session-photo-view-user",userId);
    const decision = await this.abuse.count(key, 120);
    if (!decision.allowed) return rateLimited(decision.retryAfter);
  }

  /** Bounds large S3 provider buffers and HTTP copies in each API replica. */
  reserve(userId: string): () => void {
    const current = this.concurrentByUser.get(userId) ?? 0;
    if (current >= 2 || this.globalConcurrent >= 4)
      return rateLimited();
    this.concurrentByUser.set(userId,current+1);
    this.globalConcurrent++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = (this.concurrentByUser.get(userId) ?? 1)-1;
      if (next > 0) this.concurrentByUser.set(userId,next);
      else this.concurrentByUser.delete(userId);
      this.globalConcurrent--;
    };
  }
}
