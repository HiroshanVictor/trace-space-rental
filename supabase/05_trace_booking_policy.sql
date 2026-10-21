-- Apply after 01_schema.sql and 04_inquiry_notifications.sql.
-- Adds new policy fields and guards. Existing bookings and venue records remain.
begin;

alter table public.inquiries
  add column if not exists event_nature text not null default '',
  add column if not exists outside_services text not null default '',
  add column if not exists alcohol_planned boolean not null default false,
  add column if not exists alcohol_terms_accepted boolean not null default false,
  add column if not exists preferred_language text not null default 'en';

alter table public.bookings
  add column if not exists event_nature text not null default '',
  add column if not exists outside_services text not null default '',
  add column if not exists alcohol_planned boolean not null default false,
  add column if not exists alcohol_terms_accepted boolean not null default false,
  add column if not exists preferred_language text not null default 'en',
  add column if not exists confirmation_email_status text not null default 'pending',
  add column if not exists confirmation_email_version integer not null default 1,
  add column if not exists confirmation_email_attempts integer not null default 0,
  add column if not exists confirmation_email_last_attempt_at timestamptz,
  add column if not exists confirmation_email_sent_at timestamptz,
  add column if not exists cancellation_called_at timestamptz,
  add column if not exists cancellation_email_received_at timestamptz,
  add column if not exists cancellation_fee numeric(12,2) not null default 0,
  add column if not exists extension_of uuid references public.bookings(id) on delete restrict;

create or replace function public.mark_booking_confirmation_pending() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
  if new.status in ('pending','confirmed') and
     (new.status,new.amount_paid,new.start_at,new.end_at,new.space_id,new.customer_email)
     is distinct from
     (old.status,old.amount_paid,old.start_at,old.end_at,old.space_id,old.customer_email) then
    new.confirmation_email_status:='pending';
    new.confirmation_email_version:=old.confirmation_email_version+1;
    new.confirmation_email_last_attempt_at:=null;
  end if;
  return new;
end $$;
drop trigger if exists booking_email_pending_guard on public.bookings;
create trigger booking_email_pending_guard before update on public.bookings
for each row execute function public.mark_booking_confirmation_pending();

-- Atomic claim prevents simultaneous customer emails; service role only.
create or replace function public.claim_booking_confirmation(p_id uuid)
returns setof public.bookings language sql volatile security invoker set search_path=public as $$
  update public.bookings b set confirmation_email_status='sending',
    confirmation_email_attempts=b.confirmation_email_attempts+1,
    confirmation_email_last_attempt_at=clock_timestamp()
  where b.id=p_id and b.status in ('pending','confirmed')
    and b.customer_email like '%@%'
    and b.confirmation_email_status in ('pending','failed')
    and (b.confirmation_email_last_attempt_at is null
      or b.confirmation_email_last_attempt_at<clock_timestamp()-interval '1 minute')
  returning b.*;
$$;
revoke all on function public.claim_booking_confirmation(uuid) from public,anon,authenticated;
grant execute on function public.claim_booking_confirmation(uuid) to service_role;
grant select,update on public.bookings to service_role;

-- The space row lock makes simultaneous requests for the same venue serialize.
-- Keep the original capacity trigger too: it enforces desk inventory.
create or replace function public.enforce_trace_booking_policy() returns trigger
language plpgsql security invoker set search_path=public as $$
declare s public.spaces%rowtype; gap interval; min_hours integer; local_day integer;
begin
  if new.status='cancelled' then
    if tg_op='UPDATE' then
      if old.status='cancelled' then return new; end if;
    end if;
    if new.cancellation_called_at is null or new.cancellation_email_received_at is null then
      raise exception 'Record the customer call and official email before cancellation';
    end if;
    return new;
  end if;
  select * into s from public.spaces where id=new.space_id for update;
  if not found then raise exception 'Space does not exist'; end if;
  min_hours:=case when s.type='auditorium' then 4 when s.type='desk' then 24 else 1 end;
  if new.end_at-new.start_at < make_interval(hours=>min_hours) then
    raise exception 'This space requires at least % hour(s)',min_hours;
  end if;
  if s.type='desk' and new.rate_type='hour' then
    raise exception 'Co-working seats are booked for at least one day';
  end if;
  local_day:=extract(isodow from new.start_at at time zone 'Asia/Colombo');
  if s.name='Creator Space' and local_day>5 then raise exception 'Creator Space is available on weekdays only'; end if;
  if s.name='Outdoor Space' and local_day<6 then raise exception 'Outdoor Space is available on weekends only'; end if;
  if new.status in ('confirmed','completed') and new.amount_paid < ceil(new.amount*(case when s.type='auditorium' then 0.50 else 0.25 end)) then
    raise exception 'Record the required advance before confirming this reservation';
  end if;
  if new.alcohol_planned and not new.alcohol_terms_accepted then
    raise exception 'Alcohol conditions must be accepted';
  end if;
  if new.extension_of is not null and not exists(
    select 1 from public.bookings e where e.id=new.extension_of
    and e.space_id=new.space_id and e.customer_id=new.customer_id
    and e.customer_id is not null and e.end_at=new.start_at
    and e.status in ('pending','confirmed','completed')
  ) then raise exception 'An extension must start when the same customer booking ends'; end if;
  if s.type<>'desk' then
    gap:=case when s.type='auditorium' then interval '4 hours' else interval '1 hour' end;
    if exists(select 1 from public.bookings b where b.space_id=new.space_id
      and b.id is distinct from new.id and b.status in ('pending','confirmed','completed')
      and b.start_at < new.end_at+gap
      and (case when b.id=new.extension_of then new.start_at else new.start_at-gap end) < b.end_at) then
      raise exception 'Time clash or turnover gap with an existing booking';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trace_booking_policy_guard on public.bookings;
create trigger trace_booking_policy_guard before insert or update of
  space_id,start_at,end_at,units_reserved,rate_type,status,amount,amount_paid,
  customer_id,customer_email,extension_of,alcohol_planned,alcohol_terms_accepted
on public.bookings
for each row execute function public.enforce_trace_booking_policy();

-- Email claim/status writes do not change booking occupancy. Narrow the original
-- guard so historical reservations are not revalidated on notification retries.
drop trigger if exists booking_capacity_guard on public.bookings;
create trigger booking_capacity_guard before insert or update of
  space_id,start_at,end_at,units_reserved,status
on public.bookings for each row execute function public.enforce_booking_capacity();

commit;
