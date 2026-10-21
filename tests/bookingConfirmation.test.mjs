import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../netlify/functions/notify-booking.mjs';

const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-test',RESEND_API_KEY:'email-test',RESEND_FROM_EMAIL:'sender@example.test'};
const id='123e4567-e89b-12d3-a456-426614174000';
const booking={id,reference:'TEC-TEST',space_id:id,customer_email:'customer@example.test',status:'pending',amount:10000,amount_paid:0,start_at:'2026-11-01T10:00:00Z',end_at:'2026-11-01T11:00:00Z',confirmation_email_version:1,confirmation_email_attempts:1};
const request=(body={booking_id:id},token='staff-token')=>new Request('https://demo.netlify.app/.netlify/functions/notify-booking',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify(body)});
const json=(value,status=200)=>Response.json(value,{status});

test('booking email requires an authenticated allowlisted staff account',async()=>{
 const calls=[];
 const fetchImpl=async(url)=>{calls.push(url);return json({id})};
 const handler=createHandler({env,fetchImpl});
 assert.equal((await handler(request({booking_id:id},''))).status,401);
 assert.equal(calls.length,0);
 const nonStaff=createHandler({env,fetchImpl:async url=>url.includes('/auth/v1/user')?json({id}):json([])});
 assert.equal((await nonStaff(request())).status,403);
});

test('saved pending booking sends canonical customer email with advance condition',async()=>{
 const calls=[];
 const fetchImpl=async(url,options={})=>{
  calls.push({url,options});
  if(url.includes('/auth/v1/user'))return json({id});
  if(url.includes('staff_accounts'))return json([{user_id:id}]);
  if(url.includes('rpc/claim_booking_confirmation'))return json([booking]);
  if(url.includes('spaces?'))return json([{name:'I Space',type:'meeting'}]);
  if(url.includes('api.resend.com'))return json({id:'provider-id'});
  if(options.method==='PATCH')return json([{id}]);
  throw Error(`Unexpected ${url}`);
 };
 const result=await createHandler({env,fetchImpl})(request({booking_id:id,to:'attacker@example.test',amount:0}));
 assert.equal(result.status,200);
 const email=calls.find(x=>x.url.includes('api.resend.com'));
 assert.deepEqual(JSON.parse(email.options.body).to,['customer@example.test']);
 assert.match(JSON.parse(email.options.body).text,/only after TRACE records your advance payment/);
 assert.equal(email.options.headers['Idempotency-Key'],`booking/${id}/1`);
 assert.ok(!JSON.stringify(calls).includes('attacker@example.test'));
});

test('provider failure and stale status writes never claim customer notification succeeded',async()=>{
 const base=async(url,options={})=>{
  if(url.includes('/auth/v1/user'))return json({id});
  if(url.includes('staff_accounts'))return json([{user_id:id}]);
  if(url.includes('rpc/claim_booking_confirmation'))return json([booking]);
  if(url.includes('spaces?'))return json([{name:'Neo Hub',type:'auditorium'}]);
  if(options.method==='PATCH')return json([{id}]);
  return json({error:'rejected'},500);
 };
 assert.equal((await createHandler({env,fetchImpl:base})(request())).status,502);
 const stale=async(url,options={})=>options.method==='PATCH'?json([]):base(url,options);
 assert.equal((await createHandler({env,fetchImpl:stale})(request())).status,409);
});
