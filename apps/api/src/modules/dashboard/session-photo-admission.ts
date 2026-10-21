import { HttpException, Injectable } from "@nestjs/common";

import { AntiAbuseService } from "../anti-abuse/anti-abuse.service";

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
    if (!decision.allowed) throw new HttpException("Too many requests.",429);
  }

  /** Bounds large S3 provider buffers and HTTP copies in each API replica. */
  reserve(userId: string): () => void {
    const current = this.concurrentByUser.get(userId) ?? 0;
    if (current >= 2 || this.globalConcurrent >= 4)
      throw new HttpException("Too many requests.",429);
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
