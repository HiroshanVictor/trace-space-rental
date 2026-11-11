-- Run after migrations 12–15. Dummy checkout only: no real money is collected.
begin;
alter table public.bookings add column if not exists payment_gateway text not null default 'manual'
  check(payment_gateway in ('manual','dummy'));

create table if not exists public.reservation_dummy_payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete restrict,
  total_snapshot numeric(12,2) not null check(total_snapshot>0),
  amount_requested numeric(12,2) not null check(amount_requested>0),
  email_snapshot text not null,
  space_snapshot uuid not null,
  start_snapshot timestamptz not null,
  end_snapshot timestamptz not null,
  expires_at timestamptz not null,
  status text not null default 'pending' check(status in ('pending','paid')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.reservation_dummy_payments enable row level security;
revoke all on public.reservation_dummy_payments from public,anon,authenticated;
grant select,insert,update on public.reservation_dummy_payments to service_role;

-- A staff or browser update cannot substitute for the checkout transaction.
create or replace function public.guard_dummy_reservation_payment() returns trigger
language plpgsql security definer set search_path=public as $$
declare p public.reservation_dummy_payments%rowtype;
begin
  if tg_op='UPDATE' and old.payment_gateway<>new.payment_gateway then
    raise exception 'The payment gateway cannot be changed for an existing reservation';
  end if;
  if new.payment_gateway<>'dummy' then return new; end if;
  if tg_op='INSERT' then
    if new.status<>'pending' or new.amount_paid<>0 or new.amount<=0 or new.customer_email not like '%@%' then
      raise exception 'Dummy checkout reservations require a customer email, a positive total, pending status and no recorded payment';
    end if;
    if new.start_at<=clock_timestamp() or new.payment_deadline_at<=clock_timestamp() then
      raise exception 'Choose a future reservation and payment deadline';
    end if;
    return new;
  end if;
  select * into p from public.reservation_dummy_payments where booking_id=new.id;
  if (new.status in ('confirmed','completed') or new.amount_paid is distinct from old.amount_paid) and
    (p.id is null or p.status<>'paid' or new.amount_paid<ceil(new.amount*0.5)) then
    raise exception 'Complete the customer checkout before confirming or recording the dummy advance';
  end if;
  -- Once emailed, preserve the quote to which the secure payment link refers.
  if p.id is not null and (new.amount,new.space_id,new.start_at,new.end_at,new.customer_email)
    is distinct from (p.total_snapshot,p.space_snapshot,p.start_snapshot,p.end_snapshot,p.email_snapshot) then
    raise exception 'This reservation has a payment link. Cancel it and create a new reservation to change its quote, customer email or dates';
  end if;
  return new;
end $$;
drop trigger if exists booking_dummy_payment_guard on public.bookings;
create trigger booking_dummy_payment_guard before insert or update on public.bookings
for each row execute function public.guard_dummy_reservation_payment();

create or replace function public.ensure_dummy_reservation_payment(p_booking_id uuid)
returns setof public.reservation_dummy_payments language plpgsql security invoker set search_path=public as $$
declare b public.bookings%rowtype; p public.reservation_dummy_payments%rowtype;
begin
  select * into b from public.bookings where id=p_booking_id for update;
  if not found or b.payment_gateway<>'dummy' or b.status<>'pending' or b.amount<=0 or b.amount_paid<>0 then
    raise exception 'Payment is unavailable for this reservation';
  end if;
  insert into public.reservation_dummy_payments(booking_id,total_snapshot,amount_requested,email_snapshot,space_snapshot,start_snapshot,end_snapshot,expires_at)
  values(b.id,b.amount,ceil(b.amount*0.5),b.customer_email,b.space_id,b.start_at,b.end_at,least(b.payment_deadline_at,b.start_at))
  on conflict(booking_id) do nothing;
  select * into p from public.reservation_dummy_payments where booking_id=b.id;
  if p.expires_at<=clock_timestamp() then raise exception 'The payment link has expired'; end if;
  return next p;
end $$;

create or replace function public.view_dummy_reservation_payment(p_request_id uuid)
returns table(id uuid,booking_id uuid,reference text,space_name text,start_at timestamptz,end_at timestamptz,
  total numeric,amount_requested numeric,balance_after_payment numeric,expires_at timestamptz,status text)
language sql stable security invoker set search_path=public as $$
  select p.id,b.id,coalesce(c.reference,b.reference),s.name,b.start_at,b.end_at,b.amount,p.amount_requested,
    greatest(0,b.amount-p.amount_requested),p.expires_at,
    case when b.status='cancelled' then 'cancelled' when p.status='paid' then 'paid'
      when b.status<>'pending' or p.expires_at<=now() or b.payment_deadline_at<=now() then 'expired' else 'pending' end
  from public.reservation_dummy_payments p join public.bookings b on b.id=p.booking_id join public.spaces s on s.id=b.space_id
  left join public.reservation_email_conversations c on c.booking_id=b.id where p.id=p_request_id;
$$;

create or replace function public.complete_dummy_reservation_payment(p_request_id uuid)
returns table(booking_id uuid,status text) language plpgsql security invoker set search_path=public as $$
declare p public.reservation_dummy_payments%rowtype; b public.bookings%rowtype; v_booking uuid;
begin
  -- Lock in booking-then-payment order, also used when creating the request.
  select x.booking_id into v_booking from public.reservation_dummy_payments x where x.id=p_request_id;
  select * into b from public.bookings where id=v_booking for update;
  select * into p from public.reservation_dummy_payments where id=p_request_id for update;
  if p.id is null or b.id is null or b.payment_gateway<>'dummy' or b.status='cancelled' then
    raise exception 'Payment is unavailable for this reservation';
  end if;
  if p.status='paid' then return query select b.id,'already_paid'::text;return; end if;
  if p.expires_at<=clock_timestamp() or b.payment_deadline_at<=clock_timestamp() or b.start_at<=clock_timestamp() or b.status<>'pending' then
    raise exception 'The payment link has expired or the reservation is no longer pending';
  end if;
  if (b.amount,b.space_id,b.start_at,b.end_at,b.customer_email) is distinct from
    (p.total_snapshot,p.space_snapshot,p.start_snapshot,p.end_snapshot,p.email_snapshot) or b.amount_paid<>0 then
    raise exception 'The reservation details have changed; contact TRACE';
  end if;
  update public.reservation_dummy_payments set status='paid',paid_at=clock_timestamp() where id=p.id;
  -- Existing capacity/policy triggers run here. A failed confirmation rolls back the whole transaction.
  update public.bookings set amount_paid=p.amount_requested,payment_status=case when p.amount_requested>=amount then 'paid' else 'partial' end,
    payment_method='other',payment_reference='DUMMY-'||p.id::text,payment_received_at=clock_timestamp(),status='confirmed' where id=b.id;
  return query select b.id,'confirmed'::text;
end $$;

revoke all on function public.ensure_dummy_reservation_payment(uuid),public.view_dummy_reservation_payment(uuid),public.complete_dummy_reservation_payment(uuid) from public,anon,authenticated;
grant execute on function public.ensure_dummy_reservation_payment(uuid),public.view_dummy_reservation_payment(uuid),public.complete_dummy_reservation_payment(uuid) to service_role;
commit;
