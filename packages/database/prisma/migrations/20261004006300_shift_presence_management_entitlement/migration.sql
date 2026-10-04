BEGIN;
-- Lock the read-only commercial table without granting runtime UPDATE for row locks.
CREATE FUNCTION public.shift_presence_lock_management_entitlement(
  p_user UUID,p_session UUID,p_hash TEXT,p_organization UUID
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_enabled BOOLEAN;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.staff_auth_sessions s JOIN public.users u ON u.id=s.user_id AND u.status='ACTIVE'
    JOIN public.organization_memberships m ON m.user_id=u.id AND m.organization_id=p_organization
      AND m.status='ACTIVE' AND m.role IN ('ORG_ADMIN','LOCATION_MANAGER')
    WHERE s.id=p_session AND s.user_id=p_user AND s.current_access_token_hash=p_hash
      AND s.revoked_at IS NULL AND clock_timestamp()<s.access_expires_at AND clock_timestamp()<s.absolute_expires_at
  ) THEN RETURN FALSE; END IF;
  SELECT dashboard_access_enabled INTO v_enabled FROM public.organization_subscriptions
    WHERE organization_id=p_organization FOR SHARE;
  RETURN COALESCE(v_enabled,FALSE);
END;
$$;
REVOKE ALL ON FUNCTION public.shift_presence_lock_management_entitlement(UUID,UUID,TEXT,UUID) FROM PUBLIC;
COMMIT;
