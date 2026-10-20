-- TRACE EXPERT CITY / V2: PUBLIC AVAILABILITY CALENDAR
-- Run this once in Supabase SQL Editor for existing projects, then redeploy the updated app.
-- Does NOT grant anonymous SELECT on bookings, blackouts, inquiries, or customers.
-- Returns only venue ID, exact occupied period, booking/blocked type, and desk quantity.
-- Private names, contact details, reasons, notes, amounts, references and payments stay hidden.

create or replace function public.public_space_schedule(
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  space_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  kind text,
  units_reserved integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to <= p_from or p_to > p_from + interval '36 hours' then
    raise exception 'Choose a valid public calendar day (up to 36 hours).';
  end if;
  return query
    select b.space_id,b.start_at,b.end_at,'booking'::text,b.units_reserved
    from public.bookings b
    inner join public.spaces s on s.id=b.space_id
    where s.is_active=true
      and b.status in ('pending','confirmed','completed')
      and b.start_at < p_to and p_from < b.end_at
    union all
    select x.space_id,x.start_at,x.end_at,'blocked'::text,0::integer
    from public.blackouts x
    inner join public.spaces s on s.id=x.space_id
    where s.is_active=true
      and x.start_at < p_to and p_from < x.end_at
    order by start_at;
end;
$$;

revoke all on function public.public_space_schedule(timestamptz,timestamptz) from public;
grant execute on function public.public_space_schedule(timestamptz,timestamptz) to anon, authenticated;

-- Explicitly DO NOT create public booking-table read policies.
-- Demo: SELECT * FROM public.public_space_schedule(now(),now()+interval '1 day');
