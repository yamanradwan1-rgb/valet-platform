import {
  conditionPhotoScopeKey,
  type ConditionPhotoSnapshot,
} from "@valet/employee-client";

export interface NativeConditionPhotoOpening {
  readonly scopeKey: string;
  readonly ownerRevision: number;
}

export function photoOpening(snapshot: ConditionPhotoSnapshot): NativeConditionPhotoOpening {
  return {
    scopeKey: snapshot.scope ? conditionPhotoScopeKey(snapshot.scope) : "",
    ownerRevision: snapshot.ownerRevision,
  };
}

export function photoOpeningIsCurrent(
  opening: NativeConditionPhotoOpening,
  latest: ConditionPhotoSnapshot,
): boolean {
  return latest.scope !== null &&
    opening.ownerRevision === latest.ownerRevision &&
    opening.scopeKey === conditionPhotoScopeKey(latest.scope);
}
