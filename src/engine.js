/* Shared, dependency-free reservation rules.  All time windows are [start, end). */
export const HOLD_STATUSES = new Set(['pending', 'confirmed', 'completed']);
export const SPACE_TYPES = ['meeting', 'auditorium', 'desk'];
export const RATE_TYPES = ['hour', 'day', 'week', 'month'];
export const PAYMENT_STATUSES = ['unpaid', 'partial', 'paid', 'refunded'];
const HOUR_MS=3600000;
export const turnoverHours=space=>space?.type==='auditorium'?4:space?.type==='meeting'?1:0;
export const minimumHours=space=>space?.type==='auditorium'?4:space?.type==='desk'?24:1;
export const advanceRate=space=>space?.type==='auditorium'?0.5:0.25;
export const advanceRequired=(space,amount)=>Math.ceil(Number(amount||0)*advanceRate(space));
const weekdayInColombo=value=>new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:'Asia/Colombo'}).format(toDate(value));
export function bookingPolicy(space,start,end,rateType){
  if(!isValidWindow(start,end))return {ok:false,reason:'End date/time must be after start date/time.'};
  const hours=(toDate(end)-toDate(start))/HOUR_MS;
  if(hours<minimumHours(space))return {ok:false,reason:`This space requires at least ${minimumHours(space)} hour(s).`};
  if(space?.type==='desk'&&rateType==='hour')return {ok:false,reason:'Co-working seats are booked for at least one day.'};
  const day=weekdayInColombo(start);
  if(space?.name==='Creator Space'&&(day==='Sat'||day==='Sun'))return {ok:false,reason:'Creator Space is available on weekdays only.'};
  if(space?.name==='Outdoor Space'&&day!=='Sat'&&day!=='Sun')return {ok:false,reason:'Outdoor Space is available on weekends only.'};
  return {ok:true};
}

export const toDate = value => value instanceof Date ? value : new Date(value);
export function intersects(aStart, aEnd, bStart, bEnd) {
  return toDate(aStart).getTime() < toDate(bEnd).getTime() && toDate(bStart).getTime() < toDate(aEnd).getTime();
}
export function isValidWindow(start, end) {
  return !!start && !!end && Number.isFinite(toDate(start).getTime()) && Number.isFinite(toDate(end).getTime()) && toDate(end) > toDate(start);
}
export function unitsForDuration(start, end, rateType) {
  if (!isValidWindow(start, end)) return 0;
  const ms = toDate(end) - toDate(start);
  const unitMs = {hour: 3600000, day: 86400000, week: 604800000, month: 2592000000}[rateType] || 3600000;
  return Math.max(1, Math.ceil(ms / unitMs));
}
export function rateForSpace(space, rateType) {
  return Number(({hour:space.rate_hour, day:space.rate_day, week:space.rate_week, month:space.rate_month})[rateType] || 0);
}
export function quoteBooking(space, booking) {
  const periodUnits = unitsForDuration(booking.start_at, booking.end_at, booking.rate_type);
  const units = Number(booking.units_reserved || 1);
  const subtotal = rateForSpace(space, booking.rate_type) * periodUnits * units;
  const discount = Math.max(0, Number(booking.discount || 0));
  return {periodUnits, subtotal, discount, total: Math.max(0, subtotal - discount)};
}
export function availabilityFor(space, bookings, blackouts, start, end, units = 1, ignoreId = null, extensionOf = null) {
  if (!space) return {ok:false, reason:'Select a space first.'};
  if (!space.is_active) return {ok:false, reason:'This space is archived and cannot accept bookings.'};
  if (!isValidWindow(start,end)) return {ok:false, reason:'End date/time must be after start date/time.'};
  const policy=bookingPolicy(space,start,end,space.type==='desk'?'day':'hour');
  if(!policy.ok)return policy;
  const seats = Math.max(1, Number(space.inventory_count || 1));
  units = Number(units);
  if (!Number.isInteger(units) || units < 1 || units > seats) return {ok:false, reason:`Choose between 1 and ${seats} unit(s).`};
  const blocked = blackouts.find(x => x.space_id === space.id && intersects(start,end,x.start_at,x.end_at));
  if (blocked) return {ok:false, reason:`Unavailable: ${blocked.reason || 'space closed for maintenance'}.`};
  const gap=turnoverHours(space)*HOUR_MS;
  const overlapping = bookings.filter(b => {
    if(b.space_id!==space.id||b.id===ignoreId||!HOLD_STATUSES.has(b.status))return false;
    const sameExtension=b.id===extensionOf && toDate(start).getTime()===toDate(b.end_at).getTime();
    return intersects(toDate(start).getTime()-(sameExtension?0:gap),toDate(end).getTime()+gap,b.start_at,b.end_at);
  });
  if (space.type !== 'desk' || seats === 1) {
    if (overlapping.length) return {ok:false, reason:`Time clash or turnover gap with ${overlapping[0].reference || 'an existing booking'}.`};
    return {ok:true, remaining:1};
  }
  // Calculate occupancy at all points where it can increase during the candidate range.
  const checkpoints = [toDate(start).getTime(), ...overlapping.map(b => Math.max(toDate(start).getTime(), toDate(b.start_at).getTime()))];
  const peak = Math.max(0, ...checkpoints.map(t => overlapping.filter(b => toDate(b.start_at).getTime() <= t && t < toDate(b.end_at).getTime()).reduce((sum,b) => sum+Number(b.units_reserved || 1),0)));
  const remaining = seats - peak;
  return remaining >= units ? {ok:true, remaining} : {ok:false, reason:`Only ${Math.max(0,remaining)} desk(s) remain in that period.`};
}
export function validateSpace(space) {
  if (!String(space.name || '').trim()) throw Error('Space name is required.');
  if (!SPACE_TYPES.includes(space.type)) throw Error('Choose a valid space category.');
  if (!Number.isInteger(Number(space.capacity)) || Number(space.capacity) < 1) throw Error('Capacity must be a positive whole number.');
  if (!Number.isInteger(Number(space.inventory_count)) || Number(space.inventory_count) < 1) throw Error('Units must be a positive whole number.');
  if (space.type !== 'desk' && Number(space.inventory_count) !== 1) throw Error('Rooms and auditoriums must have one reservable unit.');
  if ([space.rate_hour,space.rate_day,space.rate_week,space.rate_month].some(n => !Number.isFinite(Number(n)) || Number(n)<0)) throw Error('Rates must be zero or greater.');
}
export function validateBooking(booking,space,allBookings,blackouts) {
  if (!String(booking.customer_name||'').trim()) throw Error('Customer name is required.');
  if (!String(booking.customer_email||'').trim() && !String(booking.customer_phone||'').trim()) throw Error('Customer email or phone is required.');
  if (!RATE_TYPES.includes(booking.rate_type)) throw Error('Invalid rate type.');
  if (!isValidWindow(booking.start_at,booking.end_at)) throw Error('Choose a valid booking period.');
  if(booking.status==='cancelled'&&allBookings.find(b=>b.id===booking.id)?.status!=='cancelled'&&(!booking.cancellation_called_at||!booking.cancellation_email_received_at))throw Error('Record the customer call and official email before cancellation.');
  if(booking.status!=='cancelled'){
    const policy=bookingPolicy(space,booking.start_at,booking.end_at,booking.rate_type);
    if(!policy.ok)throw Error(policy.reason);
    if(['confirmed','completed'].includes(booking.status)&&Number(booking.amount_paid||0)<advanceRequired(space,booking.amount))throw Error('Record the required advance before confirming this reservation.');
    if(booking.alcohol_planned&&!booking.alcohol_terms_accepted)throw Error('Alcohol conditions must be accepted.');
  }
  if (booking.status !== 'cancelled') {
    const extension=allBookings.find(b=>b.id===booking.extension_of);
    if(booking.extension_of&&(!extension||extension.space_id!==booking.space_id||extension.customer_id!==booking.customer_id||toDate(extension.end_at).getTime()!==toDate(booking.start_at).getTime()))throw Error('An extension must start when the same customer’s booking ends.');
    const a = availabilityFor(space,allBookings,blackouts,booking.start_at,booking.end_at,booking.units_reserved,booking.id,booking.extension_of);
    if (!a.ok) throw Error(a.reason);
  }
  if (Number(booking.amount_paid||0) < 0) throw Error('Amount paid cannot be negative.');
}
export function safeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
export function csv(rows, keys) {
  const esc = x => '"'+String(x ?? '').replace(/"/g,'""')+'"';
  return [keys.map(esc).join(','),...rows.map(r => keys.map(k=>esc(r[k])).join(','))].join('\r\n');
}
