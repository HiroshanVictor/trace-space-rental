-- TRACE venue imagery: one official TRACE media-library image per venue.
-- Safe to rerun. Apply after 07_trace_space_images.sql.
begin;
update public.spaces set image_url=case name
  when 'Creator Space' then 'https://tracesrilanka.lk/api/media/file/540626665_1340677028010570_812977346215260445_n.jpg'
  when 'Bay 07' then 'https://tracesrilanka.lk/api/media/file/553665709_1226036409540519_1493269405323460868_n.jpg'
  when 'Outdoor Space' then 'https://tracesrilanka.lk/api/media/file/outdoorspace.webp'
  when 'TRACE Idea Studio' then 'https://tracesrilanka.lk/api/media/file/idea%20studio%20content%20image%201.webp'
  when 'I Space' then 'https://tracesrilanka.lk/api/media/file/Whats-App-Image-2026-06-04-at-09-43-04.jpg'
  when 'Neo Hub' then 'https://tracesrilanka.lk/api/media/file/727365624_122184777578624948_641799686134366868_n.jpg'
  when 'The Third Place Lobby' then 'https://tracesrilanka.lk/api/media/file/DSC03105.jpg'
  when 'Meeting Room A' then 'https://tracesrilanka.lk/api/media/file/idea%20studio%20content%20image%201.webp'
  when 'Executive Meeting Room' then 'https://tracesrilanka.lk/api/media/file/Whats-App-Image-2026-06-04-at-09-43-04.jpg'
  when 'Grand Auditorium' then 'https://tracesrilanka.lk/api/media/file/TRACE%20event%20pg-1.webp'
  when 'Co-working Desk Zone' then 'https://tracesrilanka.lk/api/media/file/coworking-1400x934.webp'
  else image_url
end
where name in ('Creator Space','Bay 07','Outdoor Space','TRACE Idea Studio','I Space','Neo Hub','The Third Place Lobby','Meeting Room A','Executive Meeting Room','Grand Auditorium','Co-working Desk Zone');
commit;
