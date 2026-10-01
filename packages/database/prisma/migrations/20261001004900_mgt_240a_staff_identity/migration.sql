-- Additive membership-owned identity; legacy rows remain NULL with no backfill.
ALTER TABLE public.organization_memberships
  ADD COLUMN first_name TEXT,
  ADD COLUMN last_name TEXT;

-- Match ECMAScript String.trim whitespace without changing Unicode/punctuation.
ALTER TABLE public.organization_memberships
  ADD CONSTRAINT organization_memberships_first_name_check CHECK (
    first_name IS NULL OR (
      char_length(first_name) BETWEEN 1 AND 100
      AND first_name !~ U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]|[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]$'
    )
  ),
  ADD CONSTRAINT organization_memberships_last_name_check CHECK (
    last_name IS NULL OR (
      char_length(last_name) BETWEEN 1 AND 100
      AND last_name !~ U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]|[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]$'
    )
  );
