import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../netlify/functions/notify-booking.mjs';
import {createHandler as canonicalHandler} from '../netlify/functions/send-reservation-email.mjs';

const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-test',RESEND_API_KEY:'email-test',RESEND_FROM_EMAIL:'sender@example.test',INQUIRY_TO_EMAIL:'staff@example.test'};
const id='123e4567-e89b-12d3-a456-426614174000';
const request=(token='staff-token')=>new Request('https://site.test/.netlify/functions/notify-booking',{method:'POST',headers:token?{Authorization:`Bearer ${token}`}:{},body:JSON.stringify({booking_id:id})});
const json=value=>Response.json(value);

test('the legacy booking endpoint shares the reservation outbox handler',()=>{
  assert.equal(createHandler,canonicalHandler);
});

test('booking email requires an authenticated allowlisted staff account',async()=>{
  let calls=0;
  const handler=createHandler({env,fetchImpl:async()=>{calls++;return json({id});}});
  assert.equal((await handler(request(''))).status,401);assert.equal(calls,0);
  const nonStaff=createHandler({env,fetchImpl:async url=>url.includes('/auth/v1/user')?json({id}):json([])});
  assert.equal((await nonStaff(request())).status,403);
});

test('an unavailable booking email claim is never reported as sent',async()=>{
  const handler=createHandler({env,fetchImpl:async url=>{
    if(url.includes('/auth/v1/user'))return json({id});
    if(url.includes('staff_accounts'))return json([{user_id:id}]);
    if(url.includes('claim_booking_reservation_email'))return json([]);
    throw Error('Unexpected send');
  }});
  assert.deepEqual(await (await handler(request())).json(),{ok:true,status:'nothing_to_send'});
});
