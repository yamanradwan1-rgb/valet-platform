-- Issue #416 reserves these event types for a future authoritative reset
-- command. The generic runtime append must reject them before replay lookup.
-- CREATE OR REPLACE retains the existing function identity, owner and ACL.
CREATE OR REPLACE FUNCTION public.append_runtime_account_security_audit_event(
    p_id UUID,
    p_event_type TEXT,
    p_subject_user_id UUID,
    p_actor_type public.account_security_actor_type,
    p_actor_user_id UUID,
    p_occurred_at TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF p_event_type IN (
        'STAFF_PASSWORD_RESET_LINK_ISSUED',
        'STAFF_PASSWORD_RESET_PASSWORD_CHANGED'
    ) THEN
        RAISE EXCEPTION 'Password reset audit requires the authoritative reset boundary.'
            USING ERRCODE = '42501';
    END IF;

    IF p_actor_type = 'CONTROLLED_OPERATOR' THEN
        RAISE EXCEPTION 'Controlled operator audit requires the controlled operator boundary.'
            USING ERRCODE = '42501';
    END IF;

    RETURN public.append_account_security_audit_event(
        p_id,
        p_event_type,
        p_subject_user_id,
        p_actor_type,
        p_actor_user_id,
        NULL,
        p_occurred_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.append_runtime_account_security_audit_event(
    UUID, TEXT, UUID, public.account_security_actor_type, UUID, TIMESTAMPTZ
) FROM PUBLIC;
