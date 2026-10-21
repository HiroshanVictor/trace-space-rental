-- TRACE EXPERT CITY — Space Rental (Supabase PostgreSQL)
-- Execute in the Supabase SQL Editor as project owner.
-- Production mode: real authentication, row-level security, atomic collision checks.
-- After this file, run 04_inquiry_notifications.sql to enable email status and retry claims.
-- WARNING: public inquiry INSERT is open to anonymous visitors; protect with CAPTCHA/rate limits for high-traffic production use.

create extension if not exists pgcrypto;
create table if not exists public.staff_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Staff member',
  created_at timestamptz not null default now()
);
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.staff_accounts where user_id = (select auth.uid())); $$;
revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to anon,authenticated;

create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  type text not null check (type in ('meeting','auditorium','desk')),
  capacity integer not null check (capacity >= 1),
  inventory_count integer not null default 1 check (inventory_count >= 1),
  amenities text not null default '',
  rate_hour numeric(12,2) not null default 0 check (rate_hour >= 0),
  rate_day numeric(12,2) not null default 0 check (rate_day >= 0),
  rate_week numeric(12,2) not null default 0 check (rate_week >= 0),
  rate_month numeric(12,2) not null default 0 check (rate_month >= 0),
  description text not null default '',
  conditions text not null default '',
  image_url text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint units_by_type check (type = 'desk' or inventory_count = 1)
);
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) > 0),
  email text not null default '',
  phone text not null default '',
  company text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  space_id uuid not null references public.spaces(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete restrict,
  customer_name text not null check (length(trim(customer_name)) > 0),
  customer_email text not null default '',
  customer_phone text not null default '',
  start_at timestamptz not null,
  end_at timestamptz not null,
  units_reserved integer not null default 1 check(units_reserved >= 1),
  rate_type text not null check(rate_type in ('hour','day','week','month')),
  amount numeric(12,2) not null default 0 check(amount >= 0),
  discount numeric(12,2) not null default 0 check(discount >= 0),
  amount_paid numeric(12,2) not null default 0 check(amount_paid >= 0 and amount_paid <= amount),
  payment_status text not null default 'unpaid' check(payment_status in ('unpaid','partial','paid','refunded')),
  payment_method text not null default 'cash' check(payment_method in ('cash','bank_transfer','card','other')),
  status text not null default 'confirmed' check(status in ('pending','confirmed','completed','cancelled')),
  purpose text not null default '',
  attendees integer not null default 1 check(attendees >= 1),
  special_requests text not null default '',
  internal_notes text not null default '',
  created_at timestamptz not null default now(),
  constraint booking_positive_duration check(end_at > start_at),
  constraint contact_required check(length(trim(customer_email)) > 0 or length(trim(customer_phone)) > 0)
);
create index if not exists bookings_space_time on public.bookings(space_id,start_at,end_at);
create table if not exists public.blackouts (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  reason text not null check(length(trim(reason)) > 0),
  created_at timestamptz not null default now(),
  constraint blackout_positive_duration check (end_at > start_at)
);
create index if not exists blackouts_space_time on public.blackouts(space_id,start_at,end_at);
create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  email text not null check (email like '%@%'),
  phone text not null check (length(trim(phone)) > 0),
  space_id uuid not null references public.spaces(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  message text not null default '',
  status text not null default 'new' check(status in ('new','contacted','converted','closed')),
  created_at timestamptz not null default now(),
  constraint inquiry_positive_duration check (end_at > start_at)
);
create table if not exists public.org_settings (
  id smallint primary key default 1 check (id=1),
  company_name text not null default 'Trace Expert City',
  email text not null default '',
  phone text not null default '',
  address text not null default 'Sri Lanka',
  currency text not null default 'LKR',
  opening_hours text not null default '8:00 AM – 8:00 PM',
  about text not null default ''
);
insert into public.org_settings (id,company_name,email,phone,address,currency,opening_hours,about)
values (1,'Trace Expert City','','','Sri Lanka','LKR','8:00 AM – 8:00 PM','Beautiful spaces for work, learning and events.')
on conflict (id) do nothing;

-- The booking trigger locks its space row first: simultaneous inserts for the same space
-- are serialized at the database layer. This is stronger than a frontend-only check.
create or replace function public.enforce_booking_capacity() returns trigger
language plpgsql security invoker set search_path = public as $$
declare
  s public.spaces%rowtype;
  peak_used integer := 0;
  conflict_ref text;
begin
  if new.status = 'cancelled' then return new; end if;
  select * into s from public.spaces where id = new.space_id for update;
  if not found then raise exception 'Space does not exist'; end if;
  if not s.is_active then raise exception 'This space is archived'; end if;
  if new.units_reserved > s.inventory_count then
    raise exception 'Only % unit(s) available for this space', s.inventory_count;
  end if;
  if exists (
    select 1 from public.blackouts x
    where x.space_id=new.space_id and x.start_at < new.end_at and new.start_at < x.end_at
  ) then raise exception 'Space is blocked for maintenance or a private event during this period'; end if;
  if s.type <> 'desk' then
    select b.reference into conflict_ref from public.bookings b
    where b.space_id=new.space_id and b.id is distinct from new.id
      and b.status in ('pending','confirmed','completed')
      and b.start_at < new.end_at and new.start_at < b.end_at
    limit 1;
    if conflict_ref is not null then raise exception 'Time clash with %', conflict_ref; end if;
  else
    -- Peak active units, tested at candidate start and each other reservation start.
    select coalesce(max((
      select coalesce(sum(b2.units_reserved),0)::integer from public.bookings b2
      where b2.space_id=new.space_id and b2.id is distinct from new.id
        and b2.status in ('pending','confirmed','completed')
        and b2.start_at <= point.timepoint and point.timepoint < b2.end_at
    )),0) into peak_used
    from (
      select new.start_at as timepoint
      union
      select greatest(new.start_at,b.start_at) as timepoint
      from public.bookings b
      where b.space_id=new.space_id and b.id is distinct from new.id
        and b.status in ('pending','confirmed','completed')
        and b.start_at < new.end_at and new.start_at < b.end_at
    ) point;
    if peak_used + new.units_reserved > s.inventory_count then
      raise exception 'Only % desk(s) remain in the selected period', greatest(0,s.inventory_count-peak_used);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists booking_capacity_guard on public.bookings;
create trigger booking_capacity_guard before insert or update on public.bookings
for each row execute function public.enforce_booking_capacity();

-- A blackout is rejected if it clashes with existing reservations.
create or replace function public.enforce_blackout() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
  perform id from public.spaces where id=new.space_id for update;
  if exists (
    select 1 from public.bookings b
    where b.space_id=new.space_id and b.status in ('pending','confirmed','completed')
    and b.start_at < new.end_at and new.start_at < b.end_at
  ) then raise exception 'Maintenance block overlaps an active reservation'; end if;
  return new;
end $$;
drop trigger if exists blackout_booking_guard on public.blackouts;
create trigger blackout_booking_guard before insert or update on public.blackouts
for each row execute function public.enforce_blackout();

-- Reducing desk inventory or changing category must not invalidate existing reservations.
create or replace function public.enforce_inventory_change() returns trigger
language plpgsql security invoker set search_path=public as $$
declare peak integer;
begin
  if new.inventory_count >= old.inventory_count and new.type=old.type then return new; end if;
  select coalesce(max((
    select coalesce(sum(b2.units_reserved),0)::integer from public.bookings b2
    where b2.space_id=new.id and b2.status in ('pending','confirmed','completed')
    and b2.start_at <= b1.start_at and b1.start_at < b2.end_at
  )),0) into peak
  from public.bookings b1 where b1.space_id=new.id and b1.status in ('pending','confirmed','completed');
  if peak > new.inventory_count then
    raise exception 'Cannot reduce inventory below reserved units. Existing peak: %', peak;
  end if;
  return new;
end $$;
drop trigger if exists space_inventory_guard on public.spaces;
create trigger space_inventory_guard before update of inventory_count,type on public.spaces
for each row execute function public.enforce_inventory_change();

-- RLS: only staff access private tables. The public sees active spaces and business profile,
-- and can submit NEW inquiries, but cannot view inquiries or bookings.
alter table public.staff_accounts enable row level security;
alter table public.spaces enable row level security;
alter table public.customers enable row level security;
alter table public.bookings enable row level security;
alter table public.inquiries enable row level security;
alter table public.blackouts enable row level security;
alter table public.org_settings enable row level security;

drop policy if exists own_staff_record on public.staff_accounts;
create policy own_staff_record on public.staff_accounts for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists spaces_public_read on public.spaces;
create policy spaces_public_read on public.spaces for select to anon,authenticated using (is_active or public.is_staff());
drop policy if exists spaces_staff_insert on public.spaces;
create policy spaces_staff_insert on public.spaces for insert to authenticated with check (public.is_staff());
drop policy if exists spaces_staff_update on public.spaces;
create policy spaces_staff_update on public.spaces for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists spaces_staff_delete on public.spaces;
create policy spaces_staff_delete on public.spaces for delete to authenticated using (public.is_staff());

drop policy if exists customers_staff_all on public.customers;
create policy customers_staff_all on public.customers for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists bookings_staff_all on public.bookings;
create policy bookings_staff_all on public.bookings for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists blackouts_staff_all on public.blackouts;
create policy blackouts_staff_all on public.blackouts for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists inquiries_public_insert on public.inquiries;
create policy inquiries_public_insert on public.inquiries for insert to anon,authenticated with check(status='new');
drop policy if exists inquiries_staff_select on public.inquiries;
create policy inquiries_staff_select on public.inquiries for select to authenticated using (public.is_staff());
drop policy if exists inquiries_staff_update on public.inquiries;
create policy inquiries_staff_update on public.inquiries for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists inquiries_staff_delete on public.inquiries;
create policy inquiries_staff_delete on public.inquiries for delete to authenticated using (public.is_staff());
drop policy if exists org_public_read on public.org_settings;
create policy org_public_read on public.org_settings for select to anon,authenticated using (true);
drop policy if exists org_staff_update on public.org_settings;
create policy org_staff_update on public.org_settings for update to authenticated using (public.is_staff()) with check(public.is_staff());

grant select on public.spaces,public.org_settings to anon,authenticated;
grant insert on public.inquiries to anon,authenticated;
grant select,insert,update,delete on public.spaces,public.bookings,public.blackouts,public.inquiries,public.customers to authenticated;
grant update on public.org_settings to authenticated;
grant select on public.staff_accounts to authenticated;

-- Optional starter venue data (demo estimates; replace with the company's real details).
insert into public.spaces(name,type,capacity,inventory_count,amenities,rate_hour,rate_day,rate_week,rate_month,description,conditions,image_url)
select 'Meeting Room A','meeting',8,1,'Wi-Fi, Projector, Whiteboard, AC',1600,9000,0,0,'Focused meetings and collaboration','No smoking','https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=1100&auto=format&fit=crop&q=85'
where not exists(select 1 from public.spaces where name='Meeting Room A');
insert into public.spaces(name,type,capacity,inventory_count,amenities,rate_hour,rate_day,rate_week,rate_month,description,image_url)
select 'Executive Meeting Room','meeting',16,1,'Wi-Fi, Smart TV, AC',2500,14000,0,0,'For team collaboration','https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1100&auto=format&fit=crop&q=85'
where not exists(select 1 from public.spaces where name='Executive Meeting Room');
insert into public.spaces(name,type,capacity,inventory_count,amenities,rate_hour,rate_day,rate_week,rate_month,description,image_url)
select 'Grand Auditorium','auditorium',220,1,'Stage, PA system, Projector, AC',12000,68000,0,0,'Large events and conferences','https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=1100&auto=format&fit=crop&q=85'
where not exists(select 1 from public.spaces where name='Grand Auditorium');
insert into public.spaces(name,type,capacity,inventory_count,amenities,rate_hour,rate_day,rate_week,rate_month,description,image_url)
select 'Co-working Desk Zone','desk',1,14,'Wi-Fi, Power, Shared kitchen',0,1200,6500,21000,'Flexible desks booked for a day, week, or 30-day period','https://images.unsplash.com/photo-1497366216548-37526070297c?w=1100&auto=format&fit=crop&q=85'
where not exists(select 1 from public.spaces where name='Co-working Desk Zone');

-- NEXT: Create staff users under Supabase Authentication > Users.
-- THEN: run supabase/02_authorize_staff.sql after substituting the real staff email.

-- Anonymous venue/time-only read endpoint for the public calendar (see migration 03).
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
