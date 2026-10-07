-- slugify() trimmed hyphens before truncating to 40 characters, so a long
-- name whose 40th character was a separator ("…-services-") produced a slug
-- ending in "-", which the organizations.slug check rejects. Truncate first,
-- then trim.

create or replace function public.slugify(value text) returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(
    left(regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', '-', 'g'), 40),
    '-'
  );
$$;
