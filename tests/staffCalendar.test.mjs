import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarRecords,calendarWindow,calendarTracks,readCalendarTable} from '../src/staffCalendar.js';

const day='2030-11-04';
const at=hour=>new Date(`${day}T${hour}:00:00`).toISOString();
const row=(id,start,end,status='confirmed')=>({id,start_at:at(start),end_at:at(end),status});

test('staff calendar includes the entire selected day and excludes cancelled inquiries and midnight boundaries',()=>{
  const records=calendarRecords({bookings:[row('early','01','03'),row('late','21','23'),row('cancelled','09','11','cancelled'),
    {...row('previous','00','01'),start_at:'2030-11-03T10:00:00',end_at:`${day}T00:00:00`}],
    blackouts:[row('maintenance','04','07')],inquiries:[row('not-a-booking','09','17')]},day);
  assert.deepEqual(records.bookings.map(x=>x.id),['early','late']);
  assert.equal(records.blackouts.length,1);
  assert.equal(calendarWindow(day,records).hours,24);
  assert.equal(calendarWindow(day,{bookings:[row('daytime','09','17')],blackouts:[]}).hours,12);
  assert.throws(()=>calendarRecords({},''),/Invalid calendar date/);
});

test('overlapping desk events have independent tracks, clipped overnight events stay within the grid',()=>{
  const window=calendarWindow(day,{bookings:[],blackouts:[]});
  const layout=calendarTracks([row('a','09','12'),row('b','10','13'),row('c','13','15'),
    {...row('overnight','08','10'),start_at:'2030-11-03T18:00:00'},row('outside','21','23')],window);
  assert.equal(layout.events.length,4);
  assert.notEqual(layout.events.find(x=>x.id==='a').track,layout.events.find(x=>x.id==='b').track);
  assert.equal(layout.events.find(x=>x.id==='overnight').left,0);
  for(const event of layout.events){assert.ok(event.width>0);assert.ok(event.left+event.width<=100);}
});

test('staff schedule filters on the server, pages beyond row limits and surfaces failures',async()=>{
  const calls=[];
  const client={from(table){const call={table};calls.push(call);return {
    select(value){call.select=value;return this},lt(key,value){call.lt=[key,value];return this},gt(key,value){call.gt=[key,value];return this},
    in(key,value){call.in=[key,value];return this},order(key){call.order=key;return this},
    range(from,to){call.range=[from,to];return Promise.resolve({data:from===0?Array.from({length:500},(_,id)=>({id})): [{id:500}]})}
  }}};
  assert.equal((await readCalendarTable(client,'bookings',day)).length,501);
  assert.deepEqual(calls.map(x=>x.range),[[0,499],[500,999]]);
  assert.deepEqual(calls[0].in,['status',['pending','confirmed','completed']]);
  assert.equal(calls[0].lt[0],'start_at');assert.equal(calls[0].gt[0],'end_at');assert.equal(calls[0].order,'id');
  client.from=()=>({select(){return this},lt(){return this},gt(){return this},order(){return this},range(){return {error:{message:'access denied'}}}});
  await assert.rejects(()=>readCalendarTable(client,'blackouts',day),/access denied/);
});
