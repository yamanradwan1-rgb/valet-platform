export interface OwnedTargetMembership {
  readonly parent: string;
  readonly grantor_superuser: boolean;
  readonly inherit_option: boolean;
  readonly set_option: boolean;
  readonly admin_option: boolean;
}

export function ownedTargetMembershipsAreSafe(
  memberships: readonly OwnedTargetMembership[],
  allowedParentRoles: readonly string[],
  allowedCreatorAdminParentRoles: readonly string[] = [],
): boolean {
  const inherited = new Set(allowedParentRoles);
  const creatorAdmin = new Set(allowedCreatorAdminParentRoles);
  const seenInherited = new Set<string>();
  const seenCreatorAdmin = new Set<string>();
  for (const membership of memberships) {
    if (
      inherited.has(membership.parent) &&
      membership.inherit_option === true &&
      membership.set_option === false &&
      membership.admin_option === false
    ) {
      if (seenInherited.has(membership.parent)) return false;
      seenInherited.add(membership.parent);
      continue;
    }
    if (
      creatorAdmin.has(membership.parent) &&
      membership.grantor_superuser === true &&
      membership.inherit_option === false &&
      membership.set_option === false &&
      membership.admin_option === true
    ) {
      if (seenCreatorAdmin.has(membership.parent)) return false;
      seenCreatorAdmin.add(membership.parent);
      continue;
    }
    return false;
  }
  return (
    seenInherited.size === inherited.size &&
    [...inherited].every((role) => seenInherited.has(role))
  );
}
