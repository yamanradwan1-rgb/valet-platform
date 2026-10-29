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
    if (!reason || !input.targetAssigneeMembershipId) return null;
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
