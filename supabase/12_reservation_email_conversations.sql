-- TRACE reservation email conversations. Run after migrations 01, 04 and 05.
-- This is additive: bookings and inquiries remain the source of truth if email is unavailable.
begin;

alter table public.inquiries
  add column if not exists reservation_reference text unique,
  add column if not exists reservation_language text not null default 'en'
    check (reservation_language in ('en','si','ta'));

alter table public.bookings
  add column if not exists inquiry_id uuid references public.inquiries(id) on delete restrict,
  add column if not exists payment_deadline_at timestamptz,
  add column if not exists payment_reference text not null default '',
  add column if not exists payment_hold_expired_at timestamptz,
  add column if not exists refund_amount numeric(12,2) not null default 0 check (refund_amount >= 0),
  add column if not exists refund_reference text not null default '';

alter table public.org_settings
  add column if not exists advance_hold_enabled boolean not null default false,
  add column if not exists advance_hold_hours integer not null default 72 check (advance_hold_hours between 1 and 720),
  add column if not exists payment_instructions text not null default '';

-- A short random reference is generated before the public anonymous insert is checked.
-- It never reveals a customer name, email address, or booking UUID.
create or replace function public.assign_inquiry_reservation_reference() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
  if new.reservation_reference is null or btrim(new.reservation_reference)='' then
    new.reservation_reference := 'TRC-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  end if;
  new.reservation_language := case when new.preferred_language in ('en','si','ta') then new.preferred_language else 'en' end;
  return new;
end $$;
drop trigger if exists inquiry_reservation_reference on public.inquiries;
create trigger inquiry_reservation_reference before insert on public.inquiries
for each row execute function public.assign_inquiry_reservation_reference();

create table if not exists public.reservation_email_conversations (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  inquiry_id uuid unique references public.inquiries(id) on delete restrict,
  booking_id uuid unique references public.bookings(id) on delete restrict,
  customer_email text not null,
  preferred_language text not null default 'en' check(preferred_language in ('en','si','ta')),
  subject text not null,
  root_message_id text,
  last_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reservation_email_outbox (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.reservation_email_conversations(id) on delete cascade,
  inquiry_id uuid references public.inquiries(id) on delete restrict,
  booking_id uuid references public.bookings(id) on delete restrict,
  event_type text not null check(event_type in (
    'inquiry_received','advance_payment_requested','reservation_confirmed',
    'payment_deadline_elapsed','reservation_cancelled','booking_completed','refund_recorded'
  )),
  status text not null default 'pending' check(status in ('pending','sending','accepted','failed')),
  attempts integer not null default 0 check(attempts >= 0),
  available_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  accepted_at timestamptz,
  last_error text not null default '',
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  unique(conversation_id,event_type)
);
create index if not exists reservation_email_outbox_dispatch_idx on public.reservation_email_outbox(status,available_at);

create table if not exists public.reservation_email_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.reservation_email_conversations(id) on delete cascade,
  outbox_id uuid not null unique references public.reservation_email_outbox(id) on delete restrict,
  event_type text not null,
  recipient text not null,
  subject text not null,
  provider_email_id text unique,
  rfc_message_id text unique,
  parent_rfc_message_id text,
  reference_message_ids text[] not null default '{}',
  delivery_status text not null default 'accepted' check(delivery_status in ('accepted','delivered','bounced','complained','failed')),
  accepted_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.reservation_email_webhook_events (
  provider_event_id text primary key,
  provider_email_id text,
  event_type text not null,
  received_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

alter table public.reservation_email_conversations enable row level security;
alter table public.reservation_email_outbox enable row level security;
alter table public.reservation_email_messages enable row level security;
alter table public.reservation_email_webhook_events enable row level security;
grant select,insert,update,delete on public.reservation_email_conversations,public.reservation_email_outbox,public.reservation_email_messages,public.reservation_email_webhook_events to service_role;

create or replace function public.queue_reservation_email(
  p_conversation uuid,p_inquiry uuid,p_booking uuid,p_event text
) returns void language plpgsql security invoker set search_path=public as $$
begin
  insert into public.reservation_email_outbox(conversation_id,inquiry_id,booking_id,event_type,idempotency_key)
  values(p_conversation,p_inquiry,p_booking,p_event,'reservation-email/'||p_conversation::text||'/'||p_event)
  on conflict(conversation_id,event_type) do nothing;
end $$;

create or replace function public.start_inquiry_email_conversation() returns trigger
language plpgsql security invoker set search_path=public as $$
declare v_id uuid;
begin
  insert into public.reservation_email_conversations(reference,inquiry_id,customer_email,preferred_language,subject)
  values(new.reservation_reference,new.id,new.email,new.reservation_language,
    'TRACE Expert City | Space Reservation | '||new.reservation_reference)
  returning id into v_id;
  perform public.queue_reservation_email(v_id,new.id,null,'inquiry_received');
  return new;
end $$;
drop trigger if exists inquiry_email_conversation on public.inquiries;
create trigger inquiry_email_conversation after insert on public.inquiries
for each row execute function public.start_inquiry_email_conversation();

create or replace function public.queue_booking_email_conversation() returns trigger
language plpgsql security invoker set search_path=public as $$
declare v_id uuid; v_ref text; v_language text; v_event text;
begin
  if new.customer_email not like '%@%' then return new; end if;
  select id into v_id from public.reservation_email_conversations where inquiry_id=new.inquiry_id;
  if v_id is null then
    v_ref := coalesce(nullif(new.reference,''),'TRC-'||upper(substr(replace(new.id::text,'-',''),1,10)));
    v_language := case when new.preferred_language in ('en','si','ta') then new.preferred_language else 'en' end;
    insert into public.reservation_email_conversations(reference,booking_id,customer_email,preferred_language,subject)
    values(v_ref,new.id,new.customer_email,v_language,'TRACE Expert City | Space Reservation | '||v_ref)
    on conflict(booking_id) do update set customer_email=excluded.customer_email,updated_at=now()
    returning id into v_id;
  else
    update public.reservation_email_conversations set booking_id=new.id,customer_email=new.customer_email,updated_at=now() where id=v_id;
  end if;
  if new.status='pending' and new.payment_deadline_at is not null then v_event:='advance_payment_requested';
  elsif new.status='confirmed' then v_event:='reservation_confirmed';
  elsif new.status='completed' then v_event:='booking_completed';
  elsif new.status='cancelled' then v_event:='reservation_cancelled';
  end if;
  if v_event is not null then perform public.queue_reservation_email(v_id,new.inquiry_id,new.id,v_event); end if;
  if new.refund_amount>0 and new.refund_reference<>'' then perform public.queue_reservation_email(v_id,new.inquiry_id,new.id,'refund_recorded'); end if;
  return new;
end $$;
drop trigger if exists booking_email_conversation on public.bookings;
create trigger booking_email_conversation after insert or update of status,amount_paid,payment_deadline_at,customer_email,refund_amount,refund_reference on public.bookings
for each row execute function public.queue_booking_email_conversation();

-- Only the server role may claim work. A stale sending row is safe to retry because
-- the same Resend idempotency key is retained on every attempt.
create or replace function public.claim_reservation_email_outbox(p_id uuid)
returns setof public.reservation_email_outbox language sql volatile security invoker set search_path=public as $$
  update public.reservation_email_outbox o set status='sending',attempts=o.attempts+1,last_attempt_at=clock_timestamp(),last_error=''
  where o.id=p_id and o.status in ('pending','failed') and o.available_at<=clock_timestamp()
  returning o.*;
$$;
create or replace function public.claim_inquiry_reservation_email(p_inquiry_id uuid)
returns setof public.reservation_email_outbox language sql volatile security invoker set search_path=public as $$
  update public.reservation_email_outbox o set status='sending',attempts=o.attempts+1,last_attempt_at=clock_timestamp(),last_error=''
  where o.id=(select x.id from public.reservation_email_outbox x where x.inquiry_id=p_inquiry_id and x.event_type='inquiry_received'
    and x.status in ('pending','failed') and x.available_at<=clock_timestamp() order by x.created_at limit 1)
  returning o.*;
$$;
create or replace function public.claim_booking_reservation_email(p_booking_id uuid)
returns setof public.reservation_email_outbox language sql volatile security invoker set search_path=public as $$
  update public.reservation_email_outbox o set status='sending',attempts=o.attempts+1,last_attempt_at=clock_timestamp(),last_error=''
  where o.id=(select x.id from public.reservation_email_outbox x where x.booking_id=p_booking_id and x.status in ('pending','failed')
    and x.available_at<=clock_timestamp() order by x.created_at limit 1) returning o.*;
$$;
revoke all on function public.claim_reservation_email_outbox(uuid),public.claim_inquiry_reservation_email(uuid),public.claim_booking_reservation_email(uuid) from public,anon,authenticated;
grant execute on function public.claim_reservation_email_outbox(uuid),public.claim_inquiry_reservation_email(uuid),public.claim_booking_reservation_email(uuid) to service_role;

create or replace function public.record_reservation_email_result(
  p_outbox uuid,p_provider_id text,p_message_id text,p_parent text,p_references text[],p_error text default null
) returns void language plpgsql security invoker set search_path=public as $$
declare o public.reservation_email_outbox%rowtype; c public.reservation_email_conversations%rowtype;
begin
  select * into o from public.reservation_email_outbox where id=p_outbox for update;
  if not found then raise exception 'Outbox record unavailable'; end if;
  if p_error is not null then
    update public.reservation_email_outbox set status='failed',available_at=clock_timestamp()+interval '5 minutes',last_error=left(p_error,300) where id=p_outbox;
    return;
  end if;
  select * into c from public.reservation_email_conversations where id=o.conversation_id for update;
  insert into public.reservation_email_messages(conversation_id,outbox_id,event_type,recipient,subject,provider_email_id,rfc_message_id,parent_rfc_message_id,reference_message_ids,accepted_at)
  values(c.id,o.id,o.event_type,c.customer_email,c.subject,p_provider_id,nullif(p_message_id,''),nullif(p_parent,''),coalesce(p_references,'{}'),clock_timestamp())
  on conflict(outbox_id) do update set provider_email_id=excluded.provider_email_id,rfc_message_id=coalesce(excluded.rfc_message_id,reservation_email_messages.rfc_message_id);
  update public.reservation_email_outbox set status='accepted',accepted_at=clock_timestamp(),last_error='' where id=p_outbox;
  if nullif(p_message_id,'') is not null then
    update public.reservation_email_conversations set root_message_id=coalesce(root_message_id,p_message_id),last_message_id=p_message_id,updated_at=clock_timestamp() where id=c.id;
  end if;
end $$;
revoke all on function public.record_reservation_email_result(uuid,text,text,text,text[],text) from public,anon,authenticated;
grant execute on function public.record_reservation_email_result(uuid,text,text,text,text[],text) to service_role;

-- This scheduler target only marks an overdue hold for staff review; it never moves money,
-- computes a fee, or cancels a reservation without management approval.
create or replace function public.expire_payment_holds_for_review()
returns setof public.reservation_email_outbox language plpgsql volatile security invoker set search_path=public as $$
declare b public.bookings%rowtype; v_conversation uuid; o public.reservation_email_outbox%rowtype;
begin
  if not (select advance_hold_enabled from public.org_settings where id=1) then return; end if;
  for b in select * from public.bookings where status='pending' and amount_paid=0 and payment_deadline_at<=clock_timestamp()
    and payment_hold_expired_at is null for update skip locked loop
    update public.bookings set payment_hold_expired_at=clock_timestamp() where id=b.id;
    select id into v_conversation from public.reservation_email_conversations where booking_id=b.id;
    if v_conversation is not null then
      perform public.queue_reservation_email(v_conversation,b.inquiry_id,b.id,'payment_deadline_elapsed');
      select * into o from public.reservation_email_outbox where conversation_id=v_conversation and event_type='payment_deadline_elapsed';
      return next o;
    end if;
  end loop;
end $$;
revoke all on function public.expire_payment_holds_for_review() from public,anon,authenticated;
grant execute on function public.expire_payment_holds_for_review() to service_role;

commit;
