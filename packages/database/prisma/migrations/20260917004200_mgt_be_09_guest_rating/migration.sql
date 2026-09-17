-- MGT-BE-09 Guest Rating: one immutable Guest-authored rating per completed visit.

CREATE TABLE "guest_ratings" (
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "valet_session_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "rated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT pg_catalog.clock_timestamp(),

    CONSTRAINT "guest_ratings_pkey" PRIMARY KEY ("valet_session_id"),
    CONSTRAINT "guest_ratings_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
    CONSTRAINT "guest_ratings_org_location_session_id_fkey"
      FOREIGN KEY ("organization_id", "location_id", "valet_session_id")
      REFERENCES "valet_sessions"("organization_id", "location_id", "id")
      ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX "guest_ratings_org_location_session_id_idx"
  ON "guest_ratings"("organization_id", "location_id", "valet_session_id");

CREATE FUNCTION public.guest_rating_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  RAISE EXCEPTION 'Guest Rating rows are immutable.' USING ERRCODE = '55000';
END;
$function$;

CREATE TRIGGER guest_ratings_immutable_guard
BEFORE UPDATE OR DELETE ON public.guest_ratings
FOR EACH ROW EXECUTE FUNCTION public.guest_rating_reject_mutation();

CREATE FUNCTION public.guest_rating_submit(
  p_guest_token text,
  p_rating integer
)
RETURNS TABLE(
  result_code text,
  valet_session_id uuid,
  rating integer,
  rated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_completed_at timestamptz;
  v_existing_rating integer;
  v_location_id uuid;
  v_organization_id uuid;
  v_rated_at timestamptz;
  v_session_id uuid;
  v_state public.valet_session_state;
  v_token_hash text;
BEGIN
  IF p_guest_token IS NULL OR p_guest_token !~ '^[A-Za-z0-9_-]{43}$' THEN
    RETURN QUERY SELECT 'INVALID_ACCESS'::text, NULL::uuid, NULL::integer,
      NULL::timestamptz;
    RETURN;
  END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RETURN QUERY SELECT 'REQUEST_INVALID'::text, NULL::uuid, NULL::integer,
      NULL::timestamptz;
    RETURN;
  END IF;

  v_token_hash := 'sha256:v1:' || pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(p_guest_token, 'UTF8')),
    'hex'
  );

  SELECT session.id, session.organization_id, session.location_id,
         session.state, session.completed_at
    INTO v_session_id, v_organization_id, v_location_id, v_state,
         v_completed_at
    FROM public.valet_sessions AS session
   WHERE session.customer_access_token_hash = v_token_hash
     AND session.customer_access_revoked_at IS NULL
     AND session.customer_access_expires_at > pg_catalog.clock_timestamp()
   FOR UPDATE OF session;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'INVALID_ACCESS'::text, NULL::uuid, NULL::integer,
      NULL::timestamptz;
    RETURN;
  END IF;

  IF v_state <> 'COMPLETED'::public.valet_session_state
     OR v_completed_at IS NULL THEN
    RETURN QUERY SELECT 'NOT_COMPLETED'::text, v_session_id, NULL::integer,
      NULL::timestamptz;
    RETURN;
  END IF;

  SELECT existing.rating, existing.rated_at
    INTO v_existing_rating, v_rated_at
    FROM public.guest_ratings AS existing
   WHERE existing.valet_session_id = v_session_id;

  IF FOUND THEN
    IF v_existing_rating = p_rating THEN
      RETURN QUERY SELECT 'OK'::text, v_session_id, v_existing_rating, v_rated_at;
    ELSE
      RETURN QUERY SELECT 'CONFLICT'::text, v_session_id, NULL::integer,
        NULL::timestamptz;
    END IF;
    RETURN;
  END IF;

  INSERT INTO public.guest_ratings AS inserted
    (organization_id, location_id, valet_session_id, rating)
  VALUES (v_organization_id, v_location_id, v_session_id, p_rating)
  RETURNING inserted.rated_at INTO v_rated_at;

  RETURN QUERY SELECT 'OK'::text, v_session_id, p_rating, v_rated_at;
END;
$function$;

REVOKE ALL ON TABLE public.guest_ratings FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_rating_submit(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_rating_reject_mutation() FROM PUBLIC;
