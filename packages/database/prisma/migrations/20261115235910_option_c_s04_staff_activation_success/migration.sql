-- Option C / S04: activation-only quota discount in the trusted writer's
-- existing invitation activation transaction. No generic finalizer grant.
BEGIN;

CREATE FUNCTION public.s04_staff_activation_success(
  p_id uuid, p_scope text, p_key text, p_invitation_hash text
) RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog AS $s04_activation$
DECLARE
  v_affected integer;
BEGIN
  IF p_scope NOT IN (
    'v1:staff-activation-client-address',
    'v1:staff-activation-credential'
  ) OR p_id IS NULL OR p_key IS NULL OR p_invitation_hash IS NULL THEN
    RAISE EXCEPTION 'S04_STAFF_ACTIVATION_SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;

  -- A credential hash supplied by the verified application ceremony must
  -- identify an activated, consumed, unrevoked invitation and matching
  -- immutable activation audit evidence. The function never accepts the raw
  -- invitation bearer or a caller-controlled success flag.
  IF NOT EXISTS (
    SELECT 1
    FROM public.staff_onboarding_invitations invitation
    JOIN public.organization_memberships member
      ON member.id=invitation.membership_id
      AND member.organization_id=invitation.organization_id
    JOIN public.users account ON account.id=member.user_id
    WHERE invitation.token_hash=p_invitation_hash
      AND invitation.consumed_at IS NOT NULL
      AND invitation.revoked_at IS NULL
      AND member.status='ACTIVE'
      AND account.status='ACTIVE'
      AND EXISTS (
        SELECT 1 FROM public.audit_events audit
        WHERE audit.organization_id=invitation.organization_id
          AND audit.entity_type='OrganizationMembership'
          AND audit.entity_id=member.id
          AND audit.event_type='STAFF_ONBOARDING_ACTIVATED'
          AND audit.metadata_json->>'invitationId'=invitation.id::text
          AND audit.metadata_json->>'generation'=invitation.generation::text
      )
  ) THEN
    RAISE EXCEPTION 'S04_STAFF_ACTIVATION_NOT_PROVEN' USING ERRCODE = '42501';
  END IF;

  UPDATE public.anti_abuse_events
    SET state='IGNORED'
    WHERE id=p_id AND scope=p_scope AND key_hash=p_key AND state='PENDING';
  GET DIAGNOSTICS v_affected=ROW_COUNT;
  RETURN v_affected;
END;
$s04_activation$;
REVOKE ALL ON FUNCTION public.s04_staff_activation_success(
  uuid,text,text,text
) FROM PUBLIC;

-- Independently provisioned protected Staff Auth writer is the only possible
-- executor; ordinary DATABASE_URL never acquires this authority.
DO $s04_acl$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles
             WHERE rolname='vaylet_staff_auth_writer') THEN
    GRANT EXECUTE ON FUNCTION public.s04_staff_activation_success(
      uuid,text,text,text
    ) TO vaylet_staff_auth_writer;
  END IF;
END;
$s04_acl$;
COMMIT;
