-- The documents CHECK constraint and generated search column call
-- tags_to_text with the signed-in user's privileges. Grant it explicitly,
-- like the other helpers, instead of relying on PostgreSQL's default EXECUTE
-- for PUBLIC: Supabase's "Securing your API" guide tells project owners how to
-- revoke that default, and documents could then no longer be added or edited.
revoke execute on function public.tags_to_text(text[]) from public, anon;
grant execute on function public.tags_to_text(text[]) to authenticated, service_role;
