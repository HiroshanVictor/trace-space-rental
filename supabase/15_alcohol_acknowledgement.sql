-- Run after migration 05 (and existing migrations in normal sequence).
-- Reuses alcohol_planned / alcohol_terms_accepted; no data rewrite or RLS changes.
begin;

create or replace function public.enforce_alcohol_acknowledgement()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if coalesce(new.alcohol_planned,false) and not coalesce(new.alcohol_terms_accepted,false) then
    raise exception using errcode='23514',
      message='Please acknowledge that alcohol requires management approval and may not be sold.';
  end if;
  -- An acknowledgement never records management approval. Existing declarations
  -- and unrelated updates to historical rows remain unchanged.
  return new;
end $$;

drop trigger if exists inquiry_alcohol_acknowledgement on public.inquiries;
create trigger inquiry_alcohol_acknowledgement
before insert or update of alcohol_planned,alcohol_terms_accepted on public.inquiries
for each row execute function public.enforce_alcohol_acknowledgement();

drop trigger if exists booking_alcohol_acknowledgement on public.bookings;
create trigger booking_alcohol_acknowledgement
before insert or update of alcohol_planned,alcohol_terms_accepted on public.bookings
for each row execute function public.enforce_alcohol_acknowledgement();

commit;
