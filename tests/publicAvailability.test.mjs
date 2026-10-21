import test from 'node:test';
import assert from 'node:assert/strict';
import {publicFromRecords,dayBounds,shiftDay,PUBLIC_EVENT_FIELDS} from '../src/publicAvailability.js';
import {availabilityFor} from '../src/engine.js';
const day='2026-11-01';
const active={id:'a',is_active:true,type:'meeting',inventory_count:1};
const desk={id:'d',is_active:true,type:'desk',inventory_count:4};
const cancelled={id:'x',is_active:false};
const start='2026-11-01T10:00:00Z',end='2026-11-01T12:00:00Z';
const records={spaces:[active,desk,cancelled],bookings:[
  {space_id:'a',start_at:start,end_at:end,status:'confirmed',units_reserved:1,customer_name:'PRIVATE NAME',customer_email:'private@example.com',reference:'TOPSECRET',amount:9000},
  {space_id:'a',start_at:start,end_at:end,status:'cancelled',customer_name:'cancelled'},
  {space_id:'x',start_at:start,end_at:end,status:'confirmed'},
  {space_id:'d',start_at:start,end_at:end,status:'pending',units_reserved:3}
 ],blackouts:[{space_id:'a',start_at:'2026-11-01T14:00:00Z',end_at:'2026-11-01T15:00:00Z',reason:'PRIVATE SECURITY NOTE'}]};
test('day boundaries are ISO and next local day',()=>{
 const bounds=dayBounds(day);
 assert.ok(new Date(bounds.end)>new Date(bounds.start));
 assert.equal(shiftDay('2026-12-31',1),'2027-01-01');
});
test('anonymous schedule includes only allowed fields and active venue bookings',()=>{
 const rows=publicFromRecords(records,'2026-11-01T00:00:00Z','2026-11-02T00:00:00Z');
 assert.equal(rows.length,3);
 for(const row of rows)assert.deepEqual(Object.keys(row).sort(),[...PUBLIC_EVENT_FIELDS].sort());
 assert.ok(!JSON.stringify(rows).includes('PRIVATE'));
 assert.ok(!JSON.stringify(rows).includes('TOPSECRET'));
 assert.equal(rows.filter(x=>x.kind==='booking').length,2);
});
test('public schedule exposes exact date/time to show collisions and desk availability',()=>{
 const rows=publicFromRecords(records,'2026-11-01T00:00:00Z','2026-11-02T00:00:00Z');
 const bookings=rows.filter(r=>r.kind==='booking').map(r=>({...r,status:'confirmed'}));
 const blocks=rows.filter(r=>r.kind==='blocked');
 assert.equal(availabilityFor(active,bookings,blocks,start,end,1).ok,false);
 assert.equal(availabilityFor(desk,bookings,blocks,start,'2026-11-02T10:00:00Z',1).ok,true);
 assert.equal(availabilityFor(desk,bookings,blocks,start,'2026-11-02T10:00:00Z',2).ok,false);
 assert.equal(availabilityFor(active,bookings,blocks,'2026-11-01T14:00:00Z','2026-11-01T15:00:00Z',1).ok,false);
});
test('previous and next day do not include nonoverlapping reservations',()=>{
 const rows=publicFromRecords(records,'2026-11-02T00:00:00Z','2026-11-03T00:00:00Z');
 assert.equal(rows.length,0);
});
