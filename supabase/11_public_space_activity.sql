-- Public homepage activity aggregate.
-- Exposes no booking rows or customer information to anonymous visitors.
create or replace function public.public_space_activity()
returns table (
  space_id uuid,
  booking_count bigint,
  latest_booking_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    count(b.id),
    max(b.created_at)
  from public.spaces s
  left join public.bookings b
    on b.space_id = s.id
    and b.status in ('pending','confirmed','completed')
  where s.is_active = true
  group by s.id;
$$;

revoke all on function public.public_space_activity() from public;
grant execute on function public.public_space_activity() to anon, authenticated;
