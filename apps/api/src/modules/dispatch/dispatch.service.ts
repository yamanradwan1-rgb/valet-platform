import { Inject, Injectable } from "@nestjs/common";

import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { createAcceptTaskCommandExecutor } from "./accept-task-command";
import { createAssignTaskCommandExecutor } from "./assign-task-command";
import { createDeclineTaskCommandExecutor } from "./decline-task-command";
import { createQueueParkingTaskCommandExecutor } from "./queue-parking-task-command";
import { createReassignTaskCommandExecutor } from "./reassign-task-command";
import { createTaskQueueQuery } from "./task-queue-query";

@Injectable()
export class DispatchService {
  private readonly acceptTask;
  private readonly assignTask;
  private readonly declineTask;
  private readonly queueParkingTask;
  private readonly readQueue;
  private readonly reassignTask;

  constructor(@Inject(RUNTIME_POSTGRES_POOL) pool: PostgresPool) {
    this.acceptTask = createAcceptTaskCommandExecutor(pool);
    this.assignTask = createAssignTaskCommandExecutor(pool);
    this.declineTask = createDeclineTaskCommandExecutor(pool);
    this.queueParkingTask = createQueueParkingTaskCommandExecutor(pool);
    this.readQueue = createTaskQueueQuery(pool);
    this.reassignTask = createReassignTaskCommandExecutor(pool);
  }

  executeAccept(request: Parameters<typeof this.acceptTask>[0]) {
    return this.acceptTask(request);
  }

  executeAssign(request: Parameters<typeof this.assignTask>[0]) {
    return this.assignTask(request);
  }

  executeDecline(request: Parameters<typeof this.declineTask>[0]) {
    return this.declineTask(request);
  }

  executeQueueParking(request: Parameters<typeof this.queueParkingTask>[0]) {
    return this.queueParkingTask(request);
  }

  executeReassign(request: Parameters<typeof this.reassignTask>[0]) {
    return this.reassignTask(request);
  }

  loadQueue(request: Parameters<typeof this.readQueue>[0]) {
    return this.readQueue(request);
  }
}
