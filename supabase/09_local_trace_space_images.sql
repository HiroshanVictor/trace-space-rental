-- Local TRACE venue image pack supplied for the booking catalogue.
-- These paths are served by the deployed site from /public/assets/.
-- Run after 08_trace_space_images_distinct.sql, then redeploy the site.
begin;
update public.spaces set image_url=case name
  when 'Creator Space' then '/public/assets/trace-creator-space.jpg'
  when 'Bay 07' then '/public/assets/trace-bay-07.jpg'
  when 'Outdoor Space' then '/public/assets/trace-outdoor-space.jpg'
  when 'TRACE Idea Studio' then '/public/assets/trace-focus-desks.webp'
  when 'I Space' then '/public/assets/trace-baobab-room.webp'
  when 'Neo Hub' then '/public/assets/trace-neo-hub.jpg'
  when 'The Third Place Lobby' then '/public/assets/trace-third-place.jpg'
  when 'Meeting Room A' then '/public/assets/trace-baobab-room.webp'
  when 'Executive Meeting Room' then '/public/assets/trace-coworking-floor.webp'
  when 'Grand Auditorium' then '/public/assets/trace-bay-07.jpg'
  when 'Co-working Desk Zone' then '/public/assets/trace-focus-desks.webp'
  else image_url
end
where name in ('Creator Space','Bay 07','Outdoor Space','TRACE Idea Studio','I Space','Neo Hub','The Third Place Lobby','Meeting Room A','Executive Meeting Room','Grand Auditorium','Co-working Desk Zone');
commit;
