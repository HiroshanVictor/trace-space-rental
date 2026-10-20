-- IMPORTANT: Run this as project owner AFTER creating your staff email in
-- Supabase Dashboard > Authentication > Users > Add user.
-- Replace the address between quotes below with your actual staff email.
-- Do NOT put your staff password in this SQL file.

insert into public.staff_accounts(user_id,display_name)
select id,'Company Administrator' from auth.users
where email = 'REPLACE_WITH_YOUR_STAFF_EMAIL@example.com'
on conflict (user_id) do update set display_name=excluded.display_name;

-- Check the allowlist:
select sa.user_id,au.email,sa.display_name from public.staff_accounts sa
join auth.users au on au.id=sa.user_id;
