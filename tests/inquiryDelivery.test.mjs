import test from 'node:test';
import assert from 'node:assert/strict';
import {notifySavedInquiry} from '../src/inquiryDelivery.js';

const id='12345678-1234-4234-8234-123456789abc';
const json=(value,status=200)=>Response.json(value,{status});

test('a saved inquiry independently dispatches a staff alert and customer acknowledgement',async()=>{
  const calls=[];
  const result=await notifySavedInquiry({staffEndpoint:'/staff-alert',reservationEndpoint:'/customer-ack',inquiryId:id,fetchImpl:async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body)});
    return url==='/staff-alert'?json({ok:true,status:'sent'}):json({ok:true,status:'accepted'});
  }});
  assert.deepEqual(calls.map(call=>call.url),['/staff-alert','/customer-ack']);
  assert.deepEqual(calls.map(call=>call.body),[{inquiry_id:id},{inquiry_id:id}]);
  assert.deepEqual(result,{staff:{status:'sent'},customer:{status:'accepted'}});
});

test('a failed staff or customer delivery leaves the saved-inquiry notification result recoverable',async()=>{
  for(const failed of ['/staff-alert','/customer-ack']){
    const result=await notifySavedInquiry({staffEndpoint:'/staff-alert',reservationEndpoint:'/customer-ack',inquiryId:id,fetchImpl:async url=>url===failed?json({ok:false},502):json({ok:true,status:url==='/staff-alert'?'sent':'accepted'})});
    assert.equal(result.staff.status,failed==='/staff-alert'?'failed':'sent');
    assert.equal(result.customer.status,failed==='/customer-ack'?'failed':'accepted');
  }
});
