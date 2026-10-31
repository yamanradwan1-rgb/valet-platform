import type { EmployeeOperationalSession } from "@valet/employee-client";

import { NativeTaskGpsPublisher } from "./native-task-gps-publisher";
import {
  NativeTaskTrackingFences,
  type MovementSubject,
} from "./native-task-tracking-fences";
import { nativeTaskTrackingBinding } from "./native-task-tracking-types";

type MovementType = "PARKING" | "RETRIEVAL";

export class NativeTaskTrackingCompletion {
  constructor(
    private readonly fences: NativeTaskTrackingFences,
    private readonly publisher: NativeTaskGpsPublisher,
    private readonly operations: Pick<EmployeeOperationalSession, "current">,
  ) {}

  suspend(type: MovementType, subject: MovementSubject): void {
    const binding = nativeTaskTrackingBinding(this.operations.current());
    if (
      !this.fences.suspendCompletion(
        binding,
        type,
        subject,
        this.publisher.currentBindingKey(),
      )
    )
      return;
    this.publisher.retire({ kind: "checking" });
  }

  finish(type: MovementType, subject: MovementSubject): boolean {
    const currentKey = this.publisher.currentBindingKey();
    const candidate = nativeTaskTrackingBinding(this.operations.current());
    const completedKey = this.fences.finishMovement(
      type,
      currentKey,
      candidate,
      subject,
    );
    if (currentKey === undefined || currentKey === completedKey)
      this.publisher.retire({ kind: "idle" });
    return completedKey !== undefined && completedKey === candidate?.key;
  }
}
