-- A spending decision is final (security audit, D113).

create or replace function public.decide_spending(entry uuid, approve boolean, note text default null)
returns public.spending_status
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e public.spending_entries;
  my_rank integer;
  their_rank integer;
  result public.spending_status := case when approve then 'approved' else 'rejected' end;
begin
  select * into e from public.spending_entries s where s.id = entry for update;
  if not found or not public.is_member(e.organization_id) then
    raise exception 'That entry doesn''t exist' using errcode = 'P0002';
  end if;
  if not public.has_permission(e.organization_id, 'manager') then
    raise exception 'Only owners and managers approve spending' using errcode = '42501', hint = 'not_approver';
  end if;
  if e.status <> 'pending' then
    raise exception 'This has already been decided' using errcode = '42501', hint = 'already_decided';
  end if;
  if e.submitted_by = auth.uid() then
    raise exception 'Nobody approves their own spending' using errcode = '42501', hint = 'own_entry';
  end if;
  if char_length(coalesce(decide_spending.note, '')) > 500 then
    raise exception 'Keep the note under 500 characters' using errcode = '22023';
  end if;
  select public.role_rank(m.role) into my_rank from public.memberships m where m.organization_id = e.organization_id and m.user_id = auth.uid();
  select public.role_rank(m.role) into their_rank from public.memberships m where m.organization_id = e.organization_id and m.user_id = e.submitted_by;
  -- the approver ranks above the submitter; an owner, whom nobody outranks, is decided by another owner
  if their_rank is not null and not (my_rank > their_rank or (my_rank = 4 and their_rank = 4)) then
    raise exception 'Only someone ranked above them can decide on this' using errcode = '42501', hint = 'rank';
  end if;
  update public.spending_entries s
  set status = result, decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(decide_spending.note), '')
  where s.id = entry;
  return result;
end;
$$;
