/** Public data projection. Never include customer identifiers, notes, or payment details. */
import {intersects} from './engine.js';

export const PUBLIC_EVENT_FIELDS = Object.freeze(['space_id','start_at','end_at','kind','units_reserved']);
export function localDay(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
}
export function shiftDay(day, offset) {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate()+offset);
  return localDay(d);
}
export function dayBounds(day) {
  // Construct day boundaries in the browser's local timezone; this handles DST changes.
  const from = new Date(`${day}T00:00:00`);
  const to = new Date(from);
  to.setDate(to.getDate()+1);
  if (!Number.isFinite(from.getTime()) || localDay(from)!==day) throw Error('Invalid calendar date.');
  return {start:from.toISOString(), end:to.toISOString()};
}
export function publicFromRecords(data, start, end) {
  const active = new Set(data.spaces.filter(s=>s.is_active).map(s=>s.id));
  const bookings = (data.bookings||[])
    .filter(b=>active.has(b.space_id) && ['pending','confirmed','completed'].includes(b.status) && intersects(b.start_at,b.end_at,start,end))
    .map(b=>({space_id:b.space_id,start_at:b.start_at,end_at:b.end_at,kind:'booking',units_reserved:Number(b.units_reserved||1)}));
  const blackouts = (data.blackouts||[])
    .filter(b=>active.has(b.space_id)&&intersects(b.start_at,b.end_at,start,end))
    .map(b=>({space_id:b.space_id,start_at:b.start_at,end_at:b.end_at,kind:'blocked',units_reserved:0}));
  return [...bookings,...blackouts].sort((a,b)=>new Date(a.start_at)-new Date(b.start_at));
}
