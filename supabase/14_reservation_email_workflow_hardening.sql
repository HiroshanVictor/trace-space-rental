-- Reservation email workflow hardening. Run after migrations 12 and 13.
-- This migration is additive and never sends mail, cancels a booking, moves money,
-- or changes public RLS policies by itself.
begin;

alter table public.bookings
  add column if not exists payment_received_at timestamptz,
  add column if not exists cancellation_reason text not null default '',
  add column if not exists cancellation_requested_at timestamptz,
  add column if not exists cancellation_decided_at timestamptz,
  add column if not exists cancellation_decided_by uuid,
  add column if not exists refund_status text not null default 'not_requested'
    check (refund_status in ('not_requested','under_review','approved','declined','paid')),
  add column if not exists refund_processed_at timestamptz;

-- A pending reservation gets a 72-hour hold by default. When the event begins
-- sooner, staff must explicitly choose an earlier deadline; a deadline may never
-- fall after the reservation begins.
create or replace function public.apply_payment_deadline() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_hours integer := 72; v_default timestamptz;
begin
  select advance_hold_hours into v_hours from public.org_settings where id=1;
  v_hours:=coalesce(v_hours,72);
  if new.status='pending' then
    if new.payment_deadline_at is null then
      v_default:=clock_timestamp()+make_interval(hours=>v_hours);
      if v_default >= new.start_at then
        raise exception 'Choose a payment deadline before the reservation starts';
      end if;
      new.payment_deadline_at:=v_default;
    end if;
    if new.payment_deadline_at >= new.start_at then
      raise exception 'Payment deadline must be before the reservation starts';
    end if;
  end if;
  if (tg_op='INSERT' and new.amount_paid>0 or tg_op='UPDATE' and new.amount_paid > old.amount_paid) and new.payment_received_at is null then
    new.payment_received_at:=clock_timestamp();
  end if;
  return new;
end $$;
drop trigger if exists booking_payment_deadline_guard on public.bookings;
create trigger booking_payment_deadline_guard before insert or update of status,start_at,payment_deadline_at,amount_paid
on public.bookings for each row execute function public.apply_payment_deadline();

-- Replaces the cancellation evidence portion of migration 05 only. A staff member
-- can record a non-payment cancellation after the scheduled review flag exists;
-- every other cancellation retains call/email evidence requirements.
create or replace function public.enforce_trace_booking_policy() returns trigger
language plpgsql security invoker set search_path=public as $$
declare s public.spaces%rowtype; gap interval; min_hours integer; local_day integer;
begin
  if new.status='cancelled' then
    if tg_op='UPDATE' and old.status='cancelled' then return new; end if;
    if not (new.cancellation_reason='nonpayment' and new.payment_hold_expired_at is not null) and
       (new.cancellation_called_at is null or new.cancellation_email_received_at is null) then
      raise exception 'Record the customer call and official email before cancellation, or record a reviewed non-payment cancellation';
    end if;
    new.cancellation_decided_at:=coalesce(new.cancellation_decided_at,clock_timestamp());
    return new;
  end if;
  select * into s from public.spaces where id=new.space_id for update;
  if not found then raise exception 'Space does not exist'; end if;
  min_hours:=case when s.type='auditorium' then 4 when s.type='desk' then 24 else 1 end;
  if new.end_at-new.start_at < make_interval(hours=>min_hours) then raise exception 'This space requires at least % hour(s)',min_hours; end if;
  if s.type='desk' and new.rate_type='hour' then raise exception 'Co-working seats are booked for at least one day'; end if;
  local_day:=extract(isodow from new.start_at at time zone 'Asia/Colombo');
  if s.name='Creator Space' and local_day>5 then raise exception 'Creator Space is available on weekdays only'; end if;
  if s.name='Outdoor Space' and local_day<6 then raise exception 'Outdoor Space is available on weekends only'; end if;
  if new.status in ('confirmed','completed') and new.amount_paid < ceil(new.amount*(case when s.type='auditorium' then 0.50 else 0.25 end)) then raise exception 'Record the required advance before confirming this reservation'; end if;
  if new.alcohol_planned and not new.alcohol_terms_accepted then raise exception 'Alcohol conditions must be accepted'; end if;
  if new.extension_of is not null and not exists(select 1 from public.bookings e where e.id=new.extension_of and e.space_id=new.space_id and e.customer_id=new.customer_id and e.customer_id is not null and e.end_at=new.start_at and e.status in ('pending','confirmed','completed')) then raise exception 'An extension must start when the same customer booking ends'; end if;
  if s.type<>'desk' then
    gap:=case when s.type='auditorium' then interval '4 hours' else interval '1 hour' end;
    if exists(select 1 from public.bookings b where b.space_id=new.space_id and b.id is distinct from new.id and b.status in ('pending','confirmed','completed') and b.start_at < new.end_at+gap and (case when b.id=new.extension_of then new.start_at else new.start_at-gap end) < b.end_at) then raise exception 'Time clash or turnover gap with an existing booking'; end if;
  end if;
  return new;
end $$;

-- Bounded exponential retry, including recovery from a worker that died while a
-- row was marked sending. Resend receives the same idempotency key on each retry.
create or replace function public.record_reservation_email_result(
  p_outbox uuid,p_provider_id text,p_message_id text,p_parent text,p_references text[],p_error text default null
) returns void language plpgsql security invoker set search_path=public as $$
declare o public.reservation_email_outbox%rowtype; c public.reservation_email_conversations%rowtype; v_delay integer;
begin
  select * into o from public.reservation_email_outbox where id=p_outbox for update;
  if not found then raise exception 'Outbox record unavailable'; end if;
  if p_error is not null then
    v_delay:=least(360,5*(2^least(o.attempts,6))::integer);
    update public.reservation_email_outbox set status='failed',available_at=clock_timestamp()+make_interval(mins=>v_delay),last_error=left(p_error,300) where id=p_outbox;
    return;
  end if;
  select * into c from public.reservation_email_conversations where id=o.conversation_id for update;
  insert into public.reservation_email_messages(conversation_id,outbox_id,event_type,recipient,subject,provider_email_id,rfc_message_id,parent_rfc_message_id,reference_message_ids,accepted_at)
  values(c.id,o.id,o.event_type,c.customer_email,c.subject,p_provider_id,nullif(p_message_id,''),nullif(p_parent,''),coalesce(p_references,'{}'),clock_timestamp())
  on conflict(outbox_id) do update set provider_email_id=excluded.provider_email_id,rfc_message_id=coalesce(excluded.rfc_message_id,reservation_email_messages.rfc_message_id);
  update public.reservation_email_outbox set status='accepted',accepted_at=clock_timestamp(),last_error='' where id=p_outbox;
  if nullif(p_message_id,'') is not null then update public.reservation_email_conversations set root_message_id=coalesce(root_message_id,p_message_id),last_message_id=p_message_id,updated_at=clock_timestamp() where id=c.id; end if;
end $$;

create or replace function public.claim_reservation_email_outbox(p_id uuid)
returns setof public.reservation_email_outbox language sql volatile security invoker set search_path=public as $$
  update public.reservation_email_outbox o set status='sending',attempts=o.attempts+1,last_attempt_at=clock_timestamp(),last_error=''
  where o.id=p_id and ((o.status in ('pending','failed') and o.available_at<=clock_timestamp()) or (o.status='sending' and o.last_attempt_at<clock_timestamp()-interval '15 minutes')) returning o.*;
$$;
revoke all on function public.claim_reservation_email_outbox(uuid) from public,anon,authenticated;
grant execute on function public.claim_reservation_email_outbox(uuid) to service_role;

-- Staff can inspect operational email state without opening private outbox tables
-- to the public. This function deliberately omits recipient addresses and payloads.
create or replace function public.staff_reservation_email_history(p_booking_id uuid)
returns table(event_type text,status text,attempts integer,last_error text,created_at timestamptz,accepted_at timestamptz,delivery_status text)
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.staff_accounts where user_id=auth.uid()) then raise exception 'staff access required'; end if;
  return query select o.event_type,o.status,o.attempts,o.last_error,o.created_at,o.accepted_at,m.delivery_status
  from public.reservation_email_outbox o left join public.reservation_email_messages m on m.outbox_id=o.id
  where o.booking_id=p_booking_id order by o.created_at desc;
end $$;
revoke all on function public.staff_reservation_email_history(uuid) from public,anon,authenticated;
grant execute on function public.staff_reservation_email_history(uuid) to authenticated;

commit;
