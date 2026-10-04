BEGIN;
CREATE TYPE public.shift_presence_management_kind AS ENUM ('COMPANY_POLICY','LOCATION_POLICY','ZONE','EXCEPTION');
CREATE TYPE public.shift_presence_management_effect AS ENUM ('CHANGED','NO_CHANGE');
CREATE TABLE public.shift_presence_management_results (
  mutation_id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  location_id UUID,
  actor_membership_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  kind public.shift_presence_management_kind NOT NULL,
  entity_id UUID NOT NULL,
  revision INTEGER NOT NULL,
  effect public.shift_presence_management_effect NOT NULL,
  audit_event_id UUID UNIQUE REFERENCES public.audit_events(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  completed_at TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT shift_presence_management_results_location_fkey FOREIGN KEY(organization_id,location_id)
    REFERENCES public.locations(organization_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT shift_presence_management_results_actor_fkey FOREIGN KEY(organization_id,actor_membership_id,actor_user_id)
    REFERENCES public.organization_memberships(organization_id,id,user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT shift_presence_management_results_revision_check CHECK(revision>0),
  CONSTRAINT shift_presence_management_results_scope_check CHECK(
    (kind='COMPANY_POLICY' AND location_id IS NULL AND entity_id=organization_id)
    OR (kind='LOCATION_POLICY' AND location_id IS NOT NULL AND entity_id=location_id)
    OR (kind IN ('ZONE','EXCEPTION') AND location_id IS NOT NULL)),
  CONSTRAINT shift_presence_management_results_effect_check CHECK(
    (effect='CHANGED' AND audit_event_id IS NOT NULL AND audit_event_id=mutation_id)
    OR (effect='NO_CHANGE' AND audit_event_id IS NULL AND kind IN ('COMPANY_POLICY','LOCATION_POLICY')))
);
CREATE FUNCTION public.shift_presence_guard_management_result() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE v_revision INTEGER; v_entity_type TEXT; v_events TEXT[];
BEGIN
  IF TG_OP<>'INSERT' THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence management result is immutable.';
  END IF;
  IF NEW.effect='NO_CHANGE' THEN
    IF NEW.kind='COMPANY_POLICY' THEN
      SELECT shift_presence_revision INTO v_revision FROM public.organizations WHERE id=NEW.entity_id;
    ELSE
      SELECT shift_presence_revision INTO v_revision FROM public.locations
        WHERE organization_id=NEW.organization_id AND id=NEW.entity_id;
    END IF;
    IF v_revision IS DISTINCT FROM NEW.revision THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence no-change result revision invalid.';
    END IF;
  ELSE
    v_entity_type:=CASE NEW.kind WHEN 'COMPANY_POLICY' THEN 'Organization' WHEN 'LOCATION_POLICY' THEN 'Location'
      WHEN 'ZONE' THEN 'ShiftPresenceZone' ELSE 'ShiftPresenceException' END;
    v_events:=CASE NEW.kind WHEN 'COMPANY_POLICY' THEN ARRAY['SHIFT_PRESENCE_COMPANY_POLICY_CHANGED']
      WHEN 'LOCATION_POLICY' THEN ARRAY['SHIFT_PRESENCE_LOCATION_POLICY_CHANGED']
      WHEN 'ZONE' THEN ARRAY['SHIFT_PRESENCE_ZONE_CREATED','SHIFT_PRESENCE_ZONE_UPDATED']
      ELSE ARRAY['SHIFT_PRESENCE_EXCEPTION_APPROVED','SHIFT_PRESENCE_EXCEPTION_REJECTED'] END;
    PERFORM id FROM public.audit_events WHERE id=NEW.audit_event_id
      AND organization_id=NEW.organization_id AND location_id IS NOT DISTINCT FROM NEW.location_id
      AND actor_membership_id=NEW.actor_membership_id AND entity_id=NEW.entity_id
      AND entity_type=v_entity_type AND event_type=ANY(v_events)
      AND (metadata_json->>'revision')::integer=NEW.revision;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence management result audit invalid.';
    END IF;
  END IF;
  NEW.completed_at:=clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER shift_presence_management_results_immutable BEFORE INSERT OR UPDATE OR DELETE
  ON public.shift_presence_management_results FOR EACH ROW EXECUTE FUNCTION public.shift_presence_guard_management_result();
REVOKE ALL ON TABLE public.shift_presence_management_results FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shift_presence_guard_management_result() FROM PUBLIC;
COMMIT;
