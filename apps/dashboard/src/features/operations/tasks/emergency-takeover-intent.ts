export const MAX_EMERGENCY_REASON_CODEPOINTS = 500;

/** Keep input bounded by Unicode codepoints, never splitting an astral character. */
export function limitEmergencyTakeoverReason(value: string) {
  let end = 0;
  let codepoints = 0;
  for (const character of value) {
    if (codepoints === MAX_EMERGENCY_REASON_CODEPOINTS) {
      return { value: value.slice(0, end), exceeded: true, codepoints };
    }
    end += character.length;
    codepoints += 1;
  }
  return { value, exceeded: false, codepoints };
}

export function validEmergencyTakeoverReason(value: string) {
  const reason = value.trim();
  return Boolean(reason) && !/[\p{Cc}\u061C\u200E\u200F\u202A-\u202E\u2066-\u206F]/u.test(reason) &&
    !limitEmergencyTakeoverReason(reason).exceeded;
}

/** One logical emergency request keeps the same identity across explicit retries. */
export class EmergencyTakeoverIntent {
  private current: {
    readonly material: string;
    readonly operationId: string;
  } | null = null;

  prepare(input: {
    readonly taskId: string;
    readonly expectedVersion: number;
    readonly targetAssigneeMembershipId: string;
    readonly reason: string;
  }) {
    const reason = input.reason.trim();
    if (!validEmergencyTakeoverReason(reason) || !input.targetAssigneeMembershipId) return null;
    const material = JSON.stringify([
      input.taskId,
      input.expectedVersion,
      input.targetAssigneeMembershipId,
      reason,
      "EMERGENCY_TASK_TAKEOVER",
    ]);
    if (this.current?.material !== material) {
      this.current = { material, operationId: crypto.randomUUID() };
    }
    return {
      operationId: this.current.operationId,
      expectedVersion: input.expectedVersion,
      targetAssigneeMembershipId: input.targetAssigneeMembershipId,
      reason,
    };
  }

  reset() {
    this.current = null;
  }
}
