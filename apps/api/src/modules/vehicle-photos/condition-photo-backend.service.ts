import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type {
  ConditionPhotoStateDiscovery,
  ConditionPhotoUploadStatus,
} from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import {
  STAFF_SESSION_CONTEXT_RESOLVER,
  type StaffSessionContext,
  type StaffSessionContextResolver,
} from "../auth/staff-session-context";
import {
  authorizeConditionPhotoScope,
  resolveAuthorizedConditionPhotoScope,
} from "./condition-photo-authorization";
import { readConditionPhotoDiscovery } from "./condition-photo-discovery-query";
import { executeConditionPhotoReconcile } from "./condition-photo-reconcile-executor";
import { readConditionPhotoStatus } from "./condition-photo-status-query";
import { resolveConditionPhotoStorageConfig } from "./condition-photo-storage-config";
import { ConditionPhotoUploadUnavailable, executeConditionPhotoUpload } from "./condition-photo-upload-executor";
import { S3PrivatePhotoStore } from "./s3-private-photo-store";

@Injectable()
export class ConditionPhotoBackendService {
  private readonly config = resolveConditionPhotoStorageConfig();
  private readonly store = this.config === undefined ? undefined :
    new S3PrivatePhotoStore(this.config);

  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly staffSessions: StaffSessionContextResolver,
  ) {}

  async authorize(authorization: string | undefined, sessionId: string): Promise<{
    credential: StaffSessionContext;
    actorMembershipId: string;
  }> {
    if (!authorization) throw new UnauthorizedException();
    const credential = await this.staffSessions.resolve(authorization);
    const scope = await resolveAuthorizedConditionPhotoScope(this.pool, credential, sessionId);
    return { credential, actorMembershipId: scope.actorMembershipId };
  }

  private requireStore(): { store: S3PrivatePhotoStore; bucketAlias: string } {
    if (!this.store || !this.config) throw new ConditionPhotoUploadUnavailable();
    return { store: this.store, bucketAlias: this.config.bucketAlias };
  }

  async upload(
    credential: StaffSessionContext,
    sessionId: string,
    clientOperationId: string,
    bytes: Buffer,
  ) {
    const { store, bucketAlias } = this.requireStore();
    return await executeConditionPhotoUpload(
      this.pool, store, bucketAlias, credential, sessionId, clientOperationId, bytes,
    );
  }

  async status(
    credential: StaffSessionContext,
    sessionId: string,
    clientOperationId: string,
  ): Promise<ConditionPhotoUploadStatus | undefined> {
    return await inPostgresTransaction(this.pool, async (tx) => {
      const scope = await authorizeConditionPhotoScope(tx, credential, sessionId);
      return await readConditionPhotoStatus(tx, scope, clientOperationId);
    });
  }

  async reconcile(
    credential: StaffSessionContext,
    sessionId: string,
    clientOperationId: string,
  ): Promise<ConditionPhotoUploadStatus> {
    const { store, bucketAlias } = this.requireStore();
    return await executeConditionPhotoReconcile(
      this.pool, store, bucketAlias, credential, sessionId, clientOperationId,
    );
  }

  async discovery(
    credential: StaffSessionContext,
    sessionId: string,
  ): Promise<ConditionPhotoStateDiscovery> {
    return await inPostgresTransaction(this.pool, async (tx) => {
      const scope = await authorizeConditionPhotoScope(tx, credential, sessionId);
      return await readConditionPhotoDiscovery(tx, scope);
    });
  }
}
