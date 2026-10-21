-- Run after 01_schema.sql for both new and existing projects. Safe to rerun.
-- Notification state is private and can be claimed only by the server role.
begin;
alter table public.inquiries
  add column if not exists notification_status text not null default 'pending'
    check(notification_status in ('pending','sending','sent','failed')),
  add column if not exists notification_attempts integer not null default 0 check(notification_attempts>=0),
  add column if not exists notification_last_attempt_at timestamptz,
  add column if not exists notification_sent_at timestamptz,
  add column if not exists notification_error text not null default '';

drop policy if exists inquiries_public_insert on public.inquiries;
create policy inquiries_public_insert on public.inquiries for insert to anon,authenticated
with check(status='new' and notification_status='pending' and notification_attempts=0
  and notification_last_attempt_at is null and notification_sent_at is null and notification_error='');

create or replace function public.claim_inquiry_notification(p_id uuid)
returns setof public.inquiries language sql volatile security invoker set search_path=public
as $$
  update public.inquiries
  set notification_status='sending', notification_attempts=notification_attempts+1,
      notification_last_attempt_at=clock_timestamp(), notification_error=''
  where id=p_id and notification_status<>'sent'
    and (notification_last_attempt_at is null or notification_last_attempt_at<clock_timestamp()-interval '60 seconds')
  returning *;
$$;
revoke all on function public.claim_inquiry_notification(uuid) from public,anon,authenticated;
grant execute on function public.claim_inquiry_notification(uuid) to service_role;
grant select,update on public.inquiries to service_role;
commit;
