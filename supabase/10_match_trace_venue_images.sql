-- Correct the live catalogue to match each named venue's image.
-- Apply once after 09_local_trace_space_images.sql; safe to rerun.
-- Existing bookings, prices, and other venue details are unchanged.
begin;
update public.spaces set image_url=case name
  when 'Creator Space' then '/public/assets/trace-creator-space.jpg'
  when 'Bay 07' then '/public/assets/trace-bay-07.jpg'
  when 'Outdoor Space' then '/public/assets/trace-outdoor-space.jpg'
  when 'TRACE Idea Studio' then '/public/assets/trace-focus-desks.webp'
  when 'I Space' then '/public/assets/trace-i-space.jpg'
  when 'Neo Hub' then '/public/assets/trace-neo-hub-talk.jpg'
  when 'The Third Place Lobby' then '/public/assets/trace-third-place-lobby.webp'
  when 'Meeting Room A' then '/public/assets/trace-baobab-room.webp'
  when 'Executive Meeting Room' then '/public/assets/trace-community-presentation.jpg'
  when 'Grand Auditorium' then '/public/assets/trace-grand-auditorium-talk.jpg'
  when 'Co-working Desk Zone' then '/public/assets/trace-coworking-floor.webp'
  else image_url
end
where name in ('Creator Space','Bay 07','Outdoor Space','TRACE Idea Studio','I Space','Neo Hub','The Third Place Lobby','Meeting Room A','Executive Meeting Room','Grand Auditorium','Co-working Desk Zone');
commit;
