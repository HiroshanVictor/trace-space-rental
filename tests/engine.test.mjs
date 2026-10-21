import test from 'node:test';
import assert from 'node:assert/strict';
import {intersects,availabilityFor,quoteBooking,validateBooking,advanceRequired,csv} from '../src/engine.js';
const room={id:'r',name:'Room A',type:'meeting',is_active:true,inventory_count:1,rate_hour:1500,rate_day:9000};
const desks={...room,id:'d',type:'desk',inventory_count:14,rate_hour:0,rate_day:1200,rate_week:6500,rate_month:20000};
const mk=(id,space_id,start,end,units=1,status='confirmed')=>({id,reference:id,space_id,start_at:`2026-11-01T${start}:00Z`,end_at:`2026-11-01T${end}:00Z`,units_reserved:units,status});
const start='2026-11-01T10:00:00Z',end='2026-11-01T12:00:00Z';
test('intervals are half-open: back to back reservations do not conflict',()=>{
 assert.equal(intersects(start,end,'2026-11-01T12:00:00Z','2026-11-01T13:00:00Z'),false);
 assert.equal(intersects(start,end,'2026-11-01T11:00:00Z','2026-11-01T13:00:00Z'),true);
});
test('room bookings require a one-hour turnover gap',()=>{
 const b=[mk('A','r','10:00','12:00')];
 assert.equal(availabilityFor(room,b,[],'2026-11-01T11:00Z','2026-11-01T13:00Z').ok,false);
 assert.equal(availabilityFor(room,b,[],'2026-11-01T12:00Z','2026-11-01T13:00Z').ok,false);
 assert.equal(availabilityFor(room,b,[],'2026-11-01T13:00Z','2026-11-01T14:00Z').ok,true);
});
test('cancelled bookings release their slots',()=>{
 const b=[mk('A','r','10:00','12:00',1,'cancelled')];
 assert.equal(availabilityFor(room,b,[],start,end).ok,true);
});
test('editing the same booking does not clash with itself',()=>{
 const b=[mk('A','r','10:00','12:00')];
 assert.equal(availabilityFor(room,b,[],start,end,1,'A').ok,true);
});
test('desk inventory counts simultaneous reserved units',()=>{
 const b=[{...mk('A','d','09:00','12:00',10),end_at:'2026-11-02T12:00:00Z'}];
 assert.equal(availabilityFor(desks,b,[],'2026-11-01T10:00Z','2026-11-02T10:00Z',4).ok,true);
 assert.equal(availabilityFor(desks,b,[],'2026-11-01T10:00Z','2026-11-02T10:00Z',5).ok,false);
});
test('peak desk calculation does not overcount disjoint existing reservations',()=>{
 const b=[{...mk('A','d','09:00','10:00',10),end_at:'2026-11-02T09:00:00Z'}, {...mk('B','d','11:00','12:00',10),start_at:'2026-11-02T11:00:00Z',end_at:'2026-11-03T11:00:00Z'}];
 assert.equal(availabilityFor(desks,b,[],'2026-11-01T09:00Z','2026-11-03T12:00Z',4).ok,true);
 assert.equal(availabilityFor(desks,b,[],'2026-11-01T09:00Z','2026-11-03T12:00Z',5).ok,false);
});
test('maintenance periods block all bookings for a space',()=>{
 const blocks=[{space_id:'r',reason:'Repairs',start_at:'2026-11-01T11:00Z',end_at:'2026-11-01T13:00Z'}];
 const a=availabilityFor(room,[],blocks,start,end);
 assert.equal(a.ok,false); assert.match(a.reason,/Repairs/);
});
test('prices round up by billing unit and multiply desk quantity',()=>{
 const booking={start_at:start,end_at:'2026-11-01T11:01Z',rate_type:'hour',units_reserved:1,discount:500};
 assert.equal(quoteBooking(room,booking).total,2500);
 assert.equal(quoteBooking(desks,{...booking,rate_type:'day',units_reserved:3,discount:0}).total,3600);
});
test('booking validation rejects incorrect ranges and missing contacts',()=>{
 assert.throws(()=>validateBooking({customer_name:'A',customer_email:'',customer_phone:'',start_at:start,end_at:end,rate_type:'hour',units_reserved:1,status:'confirmed'},room,[],[]),/email or phone/);
});
test('event minimums, advance, and extension rules protect a saved booking',()=>{
 const hall={...room,type:'auditorium',rate_hour:12000};
 assert.equal(availabilityFor(hall,[],'','2026-11-01T10:00Z','2026-11-01T13:00Z').ok,false);
 assert.equal(advanceRequired(hall,48000),24000);
 assert.equal(advanceRequired(room,6000),1500);
 const prior={...mk('A','r','10:00','12:00'),customer_id:'c1'};
 const extension={customer_name:'A',customer_email:'a@example.com',customer_id:'c1',space_id:'r',start_at:'2026-11-01T12:00:00Z',end_at:'2026-11-01T13:00:00Z',rate_type:'hour',units_reserved:1,status:'pending',amount:1500,amount_paid:0,extension_of:'A'};
 assert.doesNotThrow(()=>validateBooking(extension,room,[prior],[]));
 assert.throws(()=>validateBooking({...extension,customer_id:'c2'},room,[prior],[]),/same customer/);
 assert.throws(()=>validateBooking({...extension,extension_of:null,status:'confirmed'},room,[prior],[]),/advance/);
});
test('CSV escapes quotes and delimiter',()=>{
 assert.equal(csv([{name:'A, "B"'}],['name']),'"name"\r\n"A, ""B"""');
});
