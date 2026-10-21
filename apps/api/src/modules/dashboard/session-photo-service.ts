import { createHash, timingSafeEqual } from "node:crypto";

import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";

import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { MfaStepUpRequiredError } from "../auth/mfa/mfa-errors";
import {
  resolveConditionPhotoStorageConfig,
  type ConditionPhotoStorageConfig,
} from "../vehicle-photos/condition-photo-storage-config";
import type { PrivatePhotoStore } from "../vehicle-photos/private-photo-store";
import { S3PrivatePhotoStore } from "../vehicle-photos/s3-private-photo-store";
import type { SelectedConditionPhotoCandidate } from "../valet-sessions/condition-photo-qualified-receipt";
import type { DashboardLocationScope } from "./dashboard-location-authorization";
import { DashboardSessionPhotoAdmission } from "./session-photo-admission";
import {
  lockExactVerifiedPhotoForDelivery,
  requireExactDashboardPhotoSession,
  unchangedVerifiedPhoto,
  verifiedDashboardPhotoCandidates,
  verifiedPhotoDisplayTimes,
} from "./session-photo-query";
import { authorizeManagementSessionPhotoView } from "./session-photo-authorization";

export interface ManagementSessionPhotoManifest {
  readonly items: readonly {
    readonly photoId: string;
    readonly verifiedAt: string;
    readonly contentType: "image/jpeg";
  }[];
}

interface PhotoReadRequest {
  readonly authenticatedUserId: string;
  readonly credential: StaffSessionContext;
  readonly locationId: string;
  readonly sessionId: string;
}

type Authorize = typeof authorizeManagementSessionPhotoView;
type Transaction = Parameters<Authorize>[0];

export interface SessionPhotoReadDependencies {
  readonly pool: PostgresPool;
  readonly authorize: Authorize;
  readonly admission: Pick<DashboardSessionPhotoAdmission, "admit" | "reserve">;
  readonly storage?: {
    readonly config: Pick<ConditionPhotoStorageConfig, "bucketAlias">;
    readonly store: PrivatePhotoStore;
  };
}

class DashboardSessionPhotoError extends Error {
  constructor(readonly code:
    | "DASHBOARD_SESSION_PHOTO_NOT_VISIBLE"
    | "DASHBOARD_SESSION_PHOTO_UNAVAILABLE") {
    super(code === "DASHBOARD_SESSION_PHOTO_NOT_VISIBLE"
      ? "The requested resource is not available."
      : "Photo evidence is temporarily unavailable.");
    this.name = "DashboardSessionPhotoError";
  }
}

/** Never differentiate hidden sessions, tenants or photo IDs. */
function notVisible(): never {
  throw new DashboardSessionPhotoError("DASHBOARD_SESSION_PHOTO_NOT_VISIBLE");
}

function unavailable(): never {
  throw new DashboardSessionPhotoError("DASHBOARD_SESSION_PHOTO_UNAVAILABLE");
}

function isExpectedPhotoError(error: unknown): boolean {
  return error instanceof DashboardSessionPhotoError ||
    error instanceof UnauthorizedException ||
    error instanceof MfaStepUpRequiredError;
}

/** A failing private DB read must not publish SQL details or look like a missing resource. */
async function protectedRead<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (isExpectedPhotoError(error)) throw error;
    return unavailable();
  }
}

function assertSameScope(
  before: DashboardLocationScope,
  after: DashboardLocationScope | null,
): asserts after is DashboardLocationScope {
  if (
    after === null ||
    before.locationId !== after.locationId ||
    before.organizationId !== after.organizationId ||
    before.membershipId !== after.membershipId
  ) notVisible();
}

async function authorizedScope(
  tx: Transaction,
  request: PhotoReadRequest,
  authorize: Authorize,
): Promise<DashboardLocationScope> {
  const scope = await authorize(tx, {
    authenticatedUserId: request.authenticatedUserId,
    staffSessionContext: request.credential,
    targetLocationId: request.locationId,
    targetSessionId: request.sessionId,
  });
  if (scope === null) return notVisible();
  if (
    scope.locationId !== request.locationId ||
    !(await requireExactDashboardPhotoSession(tx, {
      location: scope,
      sessionId: request.sessionId,
    }))
  ) return notVisible();
  return scope;
}

function exactAndUsable(candidate: SelectedConditionPhotoCandidate, bucketAlias: string): boolean {
  return candidate.bucketAlias === bucketAlias &&
    typeof candidate.objectKey === "string" &&
    candidate.objectVersion !== null &&
    candidate.objectVersion.length > 0 &&
    Buffer.isBuffer(candidate.contentSha256) &&
    candidate.contentSha256.length === 32 &&
    Number.isSafeInteger(candidate.byteSize) &&
    candidate.byteSize >= 1 && candidate.byteSize <= 8 * 1024 * 1024;
}

async function admitRequest(
  dependencies: SessionPhotoReadDependencies,
  userId: string,
): Promise<void> {
  // Durable isolated Management-photo scope never consumes employee upload
  // status budget or exposes photo existence by user-visible quota details.
  await dependencies.admission.admit(userId);
}

/** Manifest never includes object key, bucket, version, digest, signed URL or bytes. */
export async function listManagementSessionPhotos(
  dependencies: SessionPhotoReadDependencies,
  request: PhotoReadRequest,
): Promise<ManagementSessionPhotoManifest> {
  await admitRequest(dependencies, request.authenticatedUserId);
  return await protectedRead(() => inPostgresTransaction(dependencies.pool, async (tx) => {
    const location = await authorizedScope(tx, request, dependencies.authorize);
    if (!dependencies.storage) return unavailable();
    const scope = { location, sessionId: request.sessionId };
    const candidates = await verifiedDashboardPhotoCandidates(tx, scope);
    // Fail closed if the candidate selector is ever refactored past its 10 cap.
    if (candidates.length > 10) return unavailable();
    const usable = candidates.filter((c) =>
      exactAndUsable(c, dependencies.storage!.config.bucketAlias));
    const times = await verifiedPhotoDisplayTimes(tx, scope, usable);
    if (times === null) return unavailable();
    return {
      items: usable.map((candidate) => ({
        photoId: candidate.photoId,
        verifiedAt: times.get(candidate.photoId)!,
        contentType: "image/jpeg" as const,
      })),
    };
  }));
}

/** No object store/network I/O may occur inside a DB transaction. */
export async function deliverManagementSessionPhotoBytes(
  dependencies: SessionPhotoReadDependencies,
  request: PhotoReadRequest,
  photoId: string,
  /** MUST synchronously enqueue bytes and register a finish/close release. */
  deliverSync: (verifiedBytes: Buffer, releaseOnResponseEnd: () => void) => void,
): Promise<void> {
  await admitRequest(dependencies, request.authenticatedUserId);
  const selected = await protectedRead(() => inPostgresTransaction(dependencies.pool, async (tx) => {
    const location = await authorizedScope(tx, request, dependencies.authorize);
    const storage = dependencies.storage;
    if (!storage) return unavailable();
    const candidates = await verifiedDashboardPhotoCandidates(tx, {
      location, sessionId: request.sessionId,
    });
    if (candidates.length > 10) return unavailable();
    const candidate = candidates.find((item) => item.photoId === photoId);
    if (!candidate || !exactAndUsable(candidate, storage.config.bucketAlias)) return notVisible();
    return { location, candidate };
  }));

  const storage = dependencies.storage!;
  const release = dependencies.admission.reserve(request.authenticatedUserId);
  let raw: Buffer | undefined;
  let queued = false;
  try {
    // Exact version mandatory: an unversioned object could be swapped before
    // we compare its size/SHA and would break the historical proof contract.
    const stored = await storage.store.readExact({
      key: selected.candidate.objectKey,
      version: selected.candidate.objectVersion,
    }, 10_000);
    raw = stored.bytes;
    if (!Buffer.isBuffer(raw) ||
        stored.version !== selected.candidate.objectVersion ||
        raw.length !== selected.candidate.byteSize) {
      return unavailable();
    }
    const hash = createHash("sha256").update(raw).digest();
    const validDigest = timingSafeEqual(hash, selected.candidate.contentSha256);
    hash.fill(0);
    if (!validDigest) return unavailable();

    // Re-authorize scope, membership, exact session and verified AVAILABLE
    // photo identity after potentially slow S3 I/O. Deny changed evidence.
    await inPostgresTransaction(dependencies.pool, async (tx) => {
      const after = await authorizedScope(tx, request, dependencies.authorize);
      assertSameScope(selected.location, after);
      const current = await verifiedDashboardPhotoCandidates(tx, {
        location: after, sessionId: request.sessionId,
      });
      if (current.length > 10 ||
          !current.some((item) => unchangedVerifiedPhoto(selected.candidate, item))) {
        return notVisible();
      }
      if (!(await lockExactVerifiedPhotoForDelivery(
        tx,{location:after,sessionId:request.sessionId},selected.candidate,
      ))) return notVisible();
      // Lock-held serialization point for bytes release: the last
      // authorization/evidence check and response.enqueue are ordered against
      // canonical revokers. Never await a network flush in this transaction.
      const outcome = deliverSync(Buffer.from(raw!), release);
      if (outcome !== undefined) return unavailable();
      queued = true;
    });
  } catch (error) {
    if (isExpectedPhotoError(error)) throw error;
    // Provider error details and internal object keys must never reach clients.
    return unavailable();
  } finally {
    raw?.fill(0);
    // On successful enqueue the HTTP response owns the reservation until
    // 'finish'/'close', guarding backpressure/slow-reader memory retention.
    if (!queued) release();
  }
}

@Injectable()
export class DashboardSessionPhotoService {
  private readonly config = resolveConditionPhotoStorageConfig();
  private readonly store = this.config
    ? new S3PrivatePhotoStore(this.config)
    : undefined;

  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    private readonly admission: DashboardSessionPhotoAdmission,
  ) {}

  private dependencies(): SessionPhotoReadDependencies {
    return {
      pool: this.pool,
      authorize: authorizeManagementSessionPhotoView,
      admission: this.admission,
      ...(this.config && this.store
        ? { storage: { config: this.config, store: this.store } }
        : {}),
    };
  }

  list(request: PhotoReadRequest) {
    return listManagementSessionPhotos(this.dependencies(), request);
  }

  deliver(
    request: PhotoReadRequest,
    photoId: string,
    deliverSync: (bytes: Buffer, releaseOnResponseEnd: () => void) => void,
  ) {
    return deliverManagementSessionPhotoBytes(
      this.dependencies(), request, photoId, deliverSync,
    );
  }
}
