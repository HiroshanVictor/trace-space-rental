// Images for the named catalogue venues. Each card has its own local asset.
export const venueImages = Object.freeze({
  'Creator Space':'/public/assets/trace-creator-space.jpg',
  'Bay 07':'/public/assets/trace-grand-auditorium-talk.jpg',
  'Outdoor Space':'/public/assets/trace-outdoor-space.jpg',
  'TRACE Idea Studio':'/public/assets/trace-focus-desks.webp',
  'I Space':'/public/assets/trace-i-space.jpg',
  'Neo Hub':'/public/assets/trace-neo-hub-talk.jpg',
  'The Third Place Lobby':'/public/assets/trace-third-place-lobby.webp',
  'Meeting Room A':'/public/assets/trace-baobab-room.webp',
  'Executive Meeting Room':'/public/assets/trace-community-presentation.jpg',
  'Grand Auditorium':'/public/assets/trace-bay-07.jpg',
  'Co-working Desk Zone':'/public/assets/trace-coworking-floor.webp'
});

function isStarterImage(value) {
  try {
    const url=new URL(value,'https://local.invalid');
    if(url.pathname.startsWith('/public/assets/trace-'))return true;
    return ['tracesrilanka.lk','www.tracesrilanka.lk','images.unsplash.com'].includes(url.hostname);
  } catch {return false}
}

export function venueImageFor(space) {
  const saved=String(space?.image_url||'').trim();
  const named=venueImages[space?.name];
  return named&&(!saved||isStarterImage(saved))?named:saved||named||'';
}
