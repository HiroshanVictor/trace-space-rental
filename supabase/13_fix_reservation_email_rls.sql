-- Fix for projects where migration 12 was applied before its trigger functions
-- were marked SECURITY DEFINER. Run once as the Supabase project owner.
begin;

alter function public.queue_reservation_email(uuid,uuid,uuid,text) security definer;
alter function public.queue_reservation_email(uuid,uuid,uuid,text) set search_path=public;
alter function public.start_inquiry_email_conversation() security definer;
alter function public.start_inquiry_email_conversation() set search_path=public;
alter function public.queue_booking_email_conversation() security definer;
alter function public.queue_booking_email_conversation() set search_path=public;

commit;
