import test from 'node:test';
import assert from 'node:assert/strict';
import {rankSpaceActivity,summarizeSpaceActivity} from '../src/publicActivity.js';

const spaces=[
  {id:'a',name:'Alpha',is_active:true},
  {id:'b',name:'Beta',is_active:true},
  {id:'c',name:'Closed',is_active:false}
];
const activity=[
  {space_id:'a',booking_count:2,latest_booking_at:'2026-10-10T12:00:00Z'},
  {space_id:'b',booking_count:5,latest_booking_at:'2026-10-09T12:00:00Z'},
  {space_id:'c',booking_count:99,latest_booking_at:'2026-10-11T12:00:00Z'}
];

test('homepage popularity orders active spaces by aggregate booking count',()=>{
  assert.deepEqual(rankSpaceActivity(spaces,activity,'popular').map(row=>row.space.name),['Beta','Alpha']);
});

test('homepage latest filter orders active spaces by latest booking timestamp',()=>{
  assert.deepEqual(rankSpaceActivity(spaces,activity,'latest').map(row=>row.space.name),['Alpha','Beta']);
});

test('local demo aggregates non-cancelled bookings without exposing booking details',()=>{
  const result=summarizeSpaceActivity(spaces,[
    {space_id:'a',status:'confirmed',created_at:'2026-10-10T12:00:00Z',customer_email:'private@example.test'},
    {space_id:'a',status:'pending',created_at:'2026-10-11T12:00:00Z'},
    {space_id:'a',status:'cancelled',created_at:'2026-10-12T12:00:00Z'},
    {space_id:'c',status:'confirmed',created_at:'2026-10-13T12:00:00Z'}
  ]);
  assert.deepEqual(result,[{space_id:'a',booking_count:2,latest_booking_at:'2026-10-11T12:00:00Z'},{space_id:'b',booking_count:0,latest_booking_at:null}]);
  assert.equal(JSON.stringify(result).includes('private@example.test'),false);
});
