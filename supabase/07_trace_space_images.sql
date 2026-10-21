-- TRACE venue imagery from the official TRACE Sri Lanka media library.
-- Additive and safe to rerun. It changes only image URLs for the named venues.
update public.spaces set image_url='https://www.tracesrilanka.lk/api/media/file/trace-home-1200x630.webp'
where name='Creator Space';
update public.spaces set image_url='https://tracesrilanka.lk/api/media/file/coworking-1400x934.webp'
where name='Bay 07';
update public.spaces set image_url='https://www.tracesrilanka.lk/api/media/file/trace-contact.webp'
where name='Outdoor Space';
update public.spaces set image_url='https://tracesrilanka.lk/api/media/file/trace-home.webp'
where name='TRACE Idea Studio';
update public.spaces set image_url='https://tracesrilanka.lk/api/media/file/coworking-1400x934.webp'
where name='I Space';
update public.spaces set image_url='https://www.tracesrilanka.lk/api/media/file/trace-pillar-community.webp'
where name='Neo Hub';
update public.spaces set image_url='https://www.tracesrilanka.lk/api/media/file/trace-contact.webp'
where name='The Third Place Lobby';

-- Keep legacy demo records visually consistent if they remain in the catalogue.
update public.spaces set image_url='https://www.tracesrilanka.lk/api/media/file/trace-home-1200x630.webp'
where name='Meeting Room A';
update public.spaces set image_url='https://tracesrilanka.lk/api/media/file/coworking-1400x934.webp'
where name='Executive Meeting Room';
update public.spaces set image_url='https://www.tracesrilanka.lk/api/media/file/trace-pillar-community.webp'
where name='Grand Auditorium';
update public.spaces set image_url='https://tracesrilanka.lk/api/media/file/trace-home.webp'
where name='Co-working Desk Zone';
