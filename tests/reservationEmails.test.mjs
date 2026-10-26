import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReservationEmail,threadHeaders} from '../netlify/functions/reservation-email-core.mjs';
import {createHandler} from '../netlify/functions/send-reservation-email.mjs';

const id='123e4567-e89b-12d3-a456-426614174000';
const outbox={id,conversation_id:id,inquiry_id:id,booking_id:null,event_type:'inquiry_received',idempotency_key:'reservation-email/test/inquiry_received'};
const conversation={id,reference:'TRC-ABCDE12345',customer_email:'customer@example.test',preferred_language:'en',subject:'TRACE Expert City | Space Reservation | TRC-ABCDE12345',root_message_id:null,last_message_id:null};
const inquiry={id,start_at:'2026-11-01T10:00:00Z',end_at:'2026-11-01T11:00:00Z',reservation_language:'en'};
const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service',RESEND_API_KEY:'resend',RESEND_FROM_EMAIL:'bookings@example.test',RESEND_REPLY_TO_EMAIL:'frontdesk@example.test'};
const json=(value,status=200)=>Response.json(value,{status});

test('thread headers preserve the actual RFC message chain without crossing conversations',()=>{
  assert.deepEqual(threadHeaders({root_message_id:null,last_message_id:null}),{parent:'',references:[],headers:{}});
  const a=threadHeaders({root_message_id:'<root-a@test>',last_message_id:'<last-a@test>'});
  assert.equal(a.headers['In-Reply-To'],'<last-a@test>');
  assert.equal(a.headers.References,'<root-a@test> <last-a@test>');
  assert.doesNotMatch(JSON.stringify(a),/root-b/);
});

test('email content uses saved customer fields and excludes staff-only notes',()=>{
  const email=buildReservationEmail({event:'reservation_confirmed',conversation,inquiry,booking:{start_at:inquiry.start_at,end_at:inquiry.end_at,amount:12500,amount_paid:4000,internal_notes:'never mail this'},space:{name:'Creator Space'}});
  assert.equal(email.subject,conversation.subject);
  assert.match(email.text,/Creator Space/);assert.match(email.text,/Asia\/Colombo/);
  assert.doesNotMatch(email.text,/never mail this/);
});

test('root inquiry email is sent with a stable subject, Reply-To, and durable idempotency key',async()=>{
  const calls=[];
  const handler=createHandler({env,fetchImpl:async(url,options={})=>{
    calls.push({url,options});
    if(url.includes('claim_inquiry_reservation_email'))return json([outbox]);
    if(url.includes('reservation_email_conversations'))return json([conversation]);
    if(url.includes('inquiries?'))return json([inquiry]);
    if(url.includes('spaces?'))return json([{name:'Creator Space'}]);
    if(url.includes('org_settings?'))return json([{payment_instructions:''}]);
    if(url==='https://api.resend.com/emails')return json({id:'resend-1'});
    if(url==='https://api.resend.com/emails/resend-1')return json({message_id:'<root@test>'});
    if(url.includes('record_reservation_email_result'))return new Response(null,{status:204});
    throw Error(`Unexpected ${url}`);
  }});
  const response=await handler(new Request('https://site.test/.netlify/functions/send-reservation-email',{method:'POST',body:JSON.stringify({inquiry_id:id})}));
  assert.equal(response.status,200);
  const sent=calls.find(x=>x.url==='https://api.resend.com/emails');const body=JSON.parse(sent.options.body);
  assert.equal(body.subject,conversation.subject);assert.equal(body.reply_to,'frontdesk@example.test');assert.deepEqual(body.to,['customer@example.test']);
  assert.equal(sent.options.headers['Idempotency-Key'],outbox.idempotency_key);
});

test('follow-up waits for an actual parent Message-ID and is not sent as a new thread',async()=>{
  const pending={...outbox,booking_id:id,inquiry_id:null,event_type:'reservation_confirmed'};let providerCalls=0;
  const handler=createHandler({env,fetchImpl:async(url,options={})=>{
    if(url.includes('/auth/v1/user'))return json({id});
    if(url.includes('staff_accounts'))return json([{user_id:id}]);
    if(url.includes('claim_booking_reservation_email'))return json([pending]);
    if(url.includes('reservation_email_conversations'))return json([{...conversation,last_message_id:null}]);
    if(url.includes('bookings?'))return json([{id,space_id:id}]);
    if(url.includes('spaces?'))return json([{name:'Creator Space'}]);
    if(url.includes('record_reservation_email_result'))return new Response(null,{status:204});
    if(url.includes('api.resend.com')){providerCalls++;return json({id:'unexpected'});}
    throw Error(`Unexpected ${url}`);
  }});
  const response=await handler(new Request('https://site.test/send',{method:'POST',headers:{Authorization:'Bearer staff'},body:JSON.stringify({booking_id:id})}));
  assert.equal(response.status,202);assert.equal(providerCalls,0);
});
