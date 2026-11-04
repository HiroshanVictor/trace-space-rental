import {dayBounds} from './publicAvailability.js';
import {intersects} from './engine.js';

const holding = new Set(['pending', 'confirmed', 'completed']);

export function calendarRecords(data, day) {
  const {start, end} = dayBounds(day);
  const inDay = row => intersects(row.start_at, row.end_at, start, end);
  return {
    bookings: (data.bookings || []).filter(row => holding.has(row.status) && inDay(row)),
    blackouts: (data.blackouts || []).filter(inDay)
  };
}

/** Expand the usual daytime view when an early/late or overnight event needs it. */
export function calendarWindow(day, records) {
  const bounds = dayBounds(day);
  const normalStart = new Date(`${day}T08:00:00`).getTime();
  const normalEnd = new Date(`${day}T20:00:00`).getTime();
  const extended = [...records.bookings, ...records.blackouts].some(row =>
    new Date(row.start_at).getTime() < normalStart || new Date(row.end_at).getTime() > normalEnd);
  return extended
    ? {start: bounds.start, end: bounds.end, fromHour: 0, hours: 24}
    : {start: new Date(normalStart).toISOString(), end: new Date(normalEnd).toISOString(), fromHour: 8, hours: 12};
}

/** Separate overlapping bookings/maintenance into tracks so every event is clickable. */
export function calendarTracks(events, window) {
  const start = new Date(window.start).getTime(), end = new Date(window.end).getTime();
  const trackEnds = [];
  const positioned = [...events].sort((a,b) => new Date(a.start_at)-new Date(b.start_at) || String(a.id).localeCompare(String(b.id)))
    .flatMap(event => {
      const from = Math.max(start, new Date(event.start_at).getTime());
      const to = Math.min(end, new Date(event.end_at).getTime());
      if (!(to > from)) return [];
      let track = trackEnds.findIndex(value => value <= from);
      if (track < 0) track = trackEnds.length;
      trackEnds[track] = to;
      return [{...event, track, left: 100*(from-start)/(end-start), width: 100*(to-from)/(end-start)}];
    });
  return {events: positioned, count: Math.max(1, trackEnds.length)};
}

/** Filter before paging: Supabase's default row cap must not hide later reservations. */
export async function readCalendarTable(client, table, day) {
  const {start, end} = dayBounds(day);
  const rows = [], size = 500;
  for (let from = 0; ; from += size) {
    let query = client.from(table).select('*').lt('start_at', end).gt('end_at', start);
    if (table === 'bookings') query = query.in('status', [...holding]);
    const {data, error} = await query.order('id').range(from, from+size-1);
    if (error) throw Error(`Loading calendar ${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < size) return rows;
  }
}
