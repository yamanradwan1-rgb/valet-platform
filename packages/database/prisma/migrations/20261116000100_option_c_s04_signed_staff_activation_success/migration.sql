-- Option C / S04: replace the unsigned migration-147 activation helper with
-- an exact command-bound HMAC proof and one-use nonce in the same transaction.
BEGIN;

DROP FUNCTION public.s04_staff_activation_success(uuid,text,text,text) RESTRICT;

CREATE FUNCTION public.s04_staff_activation_success(
  p_id uuid,
  p_scope text,
  p_key text,
  p_invitation_hash text,
  p_xid xid8,
  p_nonce uuid,
  p_expires_ms bigint,
  p_mac text
) RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog AS $s04_activation$
DECLARE
  v_affected integer;
BEGIN
  IF p_scope IS NULL OR p_scope NOT IN (
    'v1:staff-activation-client-address',
    'v1:staff-activation-credential'
  ) OR p_id IS NULL OR p_key IS NULL OR p_invitation_hash IS NULL OR
     p_key !~ '^anti-abuse-hmac-sha256:v1:[0-9a-f]{64}$' OR
     p_invitation_hash !~ '^staff-invite-sha256:v1:[0-9a-f]{64}$' OR
     p_xid IS NULL OR p_xid <> pg_catalog.pg_current_xact_id() OR
     p_nonce IS NULL OR p_expires_ms IS NULL OR p_mac IS NULL THEN
    RAISE EXCEPTION 'S04_STAFF_ACTIVATION_SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;

  -- This MAC binds the reservation identity, exact activation scope/key,
  -- invitation verifier, current PostgreSQL transaction ID and one-use nonce.
  -- It cannot authorize another row, state, operation, transaction or invite.
  PERFORM s04_quota_guard.require_proof(
    's04-v1|STAFF_ACTIVATION|' || p_id || '|' || p_scope || '|' || p_key ||
      '|' || p_invitation_hash || '|' || p_xid || '|' || p_nonce,
    p_nonce,p_expires_ms,p_mac
  );

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
  uuid,text,text,text,xid8,uuid,bigint,text
) FROM PUBLIC;

COMMIT;
