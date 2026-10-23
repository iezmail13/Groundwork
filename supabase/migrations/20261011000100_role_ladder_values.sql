-- Role ladder, step 1: the enum values. Ranked owner > manager > admin >
-- staff. Renaming keeps every existing row: organization admins become
-- owners and members become staff. The new values are added here and only
-- used by the next migration, because Postgres can't use an enum value in
-- the transaction that adds it.
alter type public.member_role rename value 'admin' to 'owner';
alter type public.member_role rename value 'member' to 'staff';
alter type public.member_role add value 'manager' before 'staff';
alter type public.member_role add value 'admin' before 'staff';
