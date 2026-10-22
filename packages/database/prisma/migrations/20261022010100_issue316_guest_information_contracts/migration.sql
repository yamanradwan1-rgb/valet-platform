-- #316: Tenant-supplied Guest Privacy/Contact. No seed or synthetic defaults.
-- Draft legal content is stored apart from append-only publication snapshots.
BEGIN;

CREATE TYPE public.guest_contact_field_mode AS ENUM (
  'INHERIT', 'OVERRIDE', 'UNAVAILABLE'
);

-- Match the API HTTPS-only contract at the database boundary too.
-- Anchoring prevents a valid prefix from hiding URL userinfo, and forbids
-- browser-normalized backslashes and whitespace/control characters.
CREATE FUNCTION public.guest_information_https_url_valid(p_url text)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT
SET search_path = pg_catalog, public AS $function$
  SELECT p_url ~
    '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?([/?#].*)?$'
    AND p_url !~ '[[:space:][:cntrl:]]'
    AND strpos(p_url, chr(92)) = 0;
$function$;

CREATE TABLE public.guest_location_privacy (
  organization_id uuid NOT NULL,
  location_id uuid NOT NULL,
  draft_en_text text,
  draft_en_url varchar(2048),
  draft_ar_text text,
  draft_ar_url varchar(2048),
  revision integer NOT NULL DEFAULT 0,
  published_version integer,
  updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT guest_location_privacy_pkey PRIMARY KEY (organization_id, location_id),
  CONSTRAINT guest_location_privacy_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT guest_location_privacy_location_fkey
    FOREIGN KEY (organization_id, location_id)
    REFERENCES public.locations(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT guest_location_privacy_revision_check CHECK (revision >= 0),
  CONSTRAINT guest_location_privacy_version_check
    CHECK (published_version IS NULL OR published_version > 0),
  CONSTRAINT guest_location_privacy_en_length_check
    CHECK (draft_en_text IS NULL OR char_length(draft_en_text) <= 5000),
  CONSTRAINT guest_location_privacy_ar_length_check
    CHECK (draft_ar_text IS NULL OR char_length(draft_ar_text) <= 5000),
  CONSTRAINT guest_location_privacy_urls_check CHECK (
    (draft_en_url IS NULL OR public.guest_information_https_url_valid(draft_en_url))
    AND (draft_ar_url IS NULL OR public.guest_information_https_url_valid(draft_ar_url))
  )
);

CREATE TABLE public.guest_privacy_publications (
  organization_id uuid NOT NULL,
  location_id uuid NOT NULL,
  version integer NOT NULL,
  en_text text,
  en_url varchar(2048),
  ar_text text,
  ar_url varchar(2048),
  published_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT guest_privacy_publications_pkey
    PRIMARY KEY (organization_id, location_id, version),
  CONSTRAINT guest_privacy_publications_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT guest_privacy_publications_location_fkey
    FOREIGN KEY (organization_id, location_id)
    REFERENCES public.locations(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT guest_privacy_publications_privacy_fkey
    FOREIGN KEY (organization_id, location_id)
    REFERENCES public.guest_location_privacy(organization_id, location_id) ON DELETE RESTRICT,
  CONSTRAINT guest_privacy_publications_version_check CHECK (version > 0),
  CONSTRAINT guest_privacy_publications_nonempty_check CHECK (
    nullif(btrim(coalesce(en_text, '')), '') IS NOT NULL
    OR nullif(btrim(coalesce(en_url, '')), '') IS NOT NULL
    OR nullif(btrim(coalesce(ar_text, '')), '') IS NOT NULL
    OR nullif(btrim(coalesce(ar_url, '')), '') IS NOT NULL
  ),
  CONSTRAINT guest_privacy_publications_text_length_check CHECK (
    (en_text IS NULL OR char_length(en_text) <= 5000)
    AND (ar_text IS NULL OR char_length(ar_text) <= 5000)
  ),
  CONSTRAINT guest_privacy_publications_urls_check CHECK (
    (en_url IS NULL OR public.guest_information_https_url_valid(en_url))
    AND (ar_url IS NULL OR public.guest_information_https_url_valid(ar_url))
  )
);

ALTER TABLE public.guest_location_privacy
  ADD CONSTRAINT guest_location_privacy_active_publication_fkey
  FOREIGN KEY (organization_id, location_id, published_version)
  REFERENCES public.guest_privacy_publications(organization_id, location_id, version)
  ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX guest_privacy_publications_scope_date_idx
  ON public.guest_privacy_publications
  (organization_id, location_id, published_at DESC);

CREATE TABLE public.guest_contact_company_defaults (
  organization_id uuid NOT NULL PRIMARY KEY
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  display_name varchar(240),
  phone varchar(32),
  support_url varchar(240),
  hours varchar(240),
  hours_confirmed boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 0,
  updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT guest_contact_company_revision_check CHECK (revision >= 0),
  CONSTRAINT guest_contact_company_values_check CHECK (
    (display_name IS NULL OR btrim(display_name) <> '')
    AND (phone IS NULL OR phone ~ '^\+[1-9][0-9]{6,14}$')
    AND (support_url IS NULL OR public.guest_information_https_url_valid(support_url))
    AND (hours IS NULL OR btrim(hours) <> '')
    AND (NOT hours_confirmed OR hours IS NOT NULL)
  )
);

CREATE TABLE public.guest_contact_location_overrides (
  organization_id uuid NOT NULL,
  location_id uuid NOT NULL,
  display_name_mode public.guest_contact_field_mode NOT NULL DEFAULT 'INHERIT',
  display_name varchar(240),
  phone_mode public.guest_contact_field_mode NOT NULL DEFAULT 'INHERIT',
  phone varchar(32),
  support_url_mode public.guest_contact_field_mode NOT NULL DEFAULT 'INHERIT',
  support_url varchar(240),
  hours_mode public.guest_contact_field_mode NOT NULL DEFAULT 'INHERIT',
  hours varchar(240),
  hours_confirmed boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 0,
  updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT guest_contact_location_overrides_pkey PRIMARY KEY (organization_id, location_id),
  CONSTRAINT guest_contact_location_overrides_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT guest_contact_location_overrides_location_fkey
    FOREIGN KEY (organization_id, location_id)
    REFERENCES public.locations(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT guest_contact_location_revision_check CHECK (revision >= 0),
  CONSTRAINT guest_contact_location_modes_check CHECK (
    ((display_name_mode = 'OVERRIDE' AND display_name IS NOT NULL
      AND btrim(display_name) <> '') OR
      (display_name_mode <> 'OVERRIDE' AND display_name IS NULL))
    AND ((phone_mode = 'OVERRIDE' AND phone IS NOT NULL
      AND phone ~ '^\+[1-9][0-9]{6,14}$') OR
      (phone_mode <> 'OVERRIDE' AND phone IS NULL))
    AND ((support_url_mode = 'OVERRIDE' AND support_url IS NOT NULL
      AND public.guest_information_https_url_valid(support_url)) OR
      (support_url_mode <> 'OVERRIDE' AND support_url IS NULL))
    AND ((hours_mode = 'OVERRIDE' AND hours IS NOT NULL
      AND btrim(hours) <> '') OR
      (hours_mode <> 'OVERRIDE' AND hours IS NULL))
    AND (NOT hours_confirmed OR hours_mode = 'OVERRIDE')
  )
);

-- The publication ledger is immutable, even for accidental owner-level DML.
CREATE FUNCTION public.guest_privacy_forbid_publication_change()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  RAISE EXCEPTION 'Guest privacy publications are immutable.'
    USING ERRCODE = '55000';
END;
$function$;
CREATE TRIGGER guest_privacy_publications_immutable
  BEFORE UPDATE OR DELETE ON public.guest_privacy_publications
  FOR EACH ROW EXECUTE FUNCTION public.guest_privacy_forbid_publication_change();

REVOKE ALL ON TABLE
  public.guest_location_privacy,
  public.guest_privacy_publications,
  public.guest_contact_company_defaults,
  public.guest_contact_location_overrides
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_privacy_forbid_publication_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_information_https_url_valid(text) FROM PUBLIC;
COMMIT;
