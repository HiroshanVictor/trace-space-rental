import test from 'node:test';
import assert from 'node:assert/strict';
import {paymentSettings,paymentToken,verifyPaymentToken} from '../netlify/functions/lib/payment-links.mjs';
import {createHandler as checkoutHandler} from '../netlify/functions/reservation-payment.mjs';
import {createHandler as emailHandler} from '../netlify/functions/send-reservation-email.mjs';
import {buildConfig} from '../scripts/configure.mjs';
import {requestCheckout} from '../src/paymentCheckout.js';

const id='123e4567-e89b-12d3-a456-426614174000';
const requestId='223e4567-e89b-12d3-a456-426614174000';
const secret='test-only-signing-secret-with-at-least-32-characters';
const env={PAYMENT_GATEWAY:'dummy',PAYMENT_LINK_SECRET:secret,PAYMENT_SITE_URL:'https://trace.example.test',SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fake-service-key',
  SCHEDULER_SECRET:'fake-scheduler-key',EMAIL_PROVIDER:'gmail_smtp',SMTP_HOST:'smtp.gmail.com',SMTP_PORT:'465',SMTP_USER:'test@gmail.com',SMTP_PASS:'fake-smtp-password',EMAIL_FROM_EMAIL:'test@gmail.com',EMAIL_REPLY_TO:'desk@example.test'};
const payment={id:requestId,booking_id:id,reference:'TRC-PAYMENT',space_name:'Creator Space',start_at:'2099-11-04T09:00:00Z',end_at:'2099-11-04T11:00:00Z',
  total:10000,amount_requested:5000,balance_after_payment:5000,expires_at:'2099-11-03T09:00:00Z',status:'pending'};
const token=()=>paymentToken(payment,secret);
const req=(action,extra={})=>new Request('https://trace.example.test/.netlify/functions/reservation-payment',{method:'POST',body:JSON.stringify({action,token:token(),...extra})});

test('payment links are signed, expire, use a configured origin and expose no signing keys in public config',()=>{
  assert.equal(paymentSettings(env).origin,'https://trace.example.test');
  for(const extra of [{PAYMENT_GATEWAY:'manual'},{PAYMENT_LINK_SECRET:'short'},{PAYMENT_SITE_URL:'http://attacker.test'},{PAYMENT_SITE_URL:'https://user:pass@host.test'}])assert.equal(paymentSettings({...env,...extra}),null);
  assert.deepEqual(verifyPaymentToken(token(),secret),{requestId,bookingId:id});
  assert.equal(verifyPaymentToken(token()+'tampered',secret),null);
  assert.equal(verifyPaymentToken(token(),'different signing secret'),null);
  assert.equal(verifyPaymentToken(token(),secret,new Date('2100-01-01').getTime()),null);
  const config=buildConfig({...env,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'});
  assert.equal(config.paymentGateway,'dummy');assert.doesNotMatch(JSON.stringify(config),/fake-service|fake-smtp|signing-secret|scheduler-key/);
});

test('staff approval sends the saved customer a signed half-payment link in the existing email thread',async()=>{
  const messages=[],records=[];
  const fetchImpl=async(url,options={})=>{
    if(url.includes('/auth/v1/user'))return Response.json({id});
    if(url.includes('staff_accounts'))return Response.json([{user_id:id}]);
    if(url.includes('/claim_booking_reservation_email'))return Response.json([{id,booking_id:id,conversation_id:id,inquiry_id:null,event_type:'advance_payment_requested',idempotency_key:'approval-test'}]);
    if(url.includes('reservation_email_conversations'))return Response.json([{id,inquiry_id:null,customer_email:'customer@example.test',reference:payment.reference,subject:'TRACE Expert City | Space Reservation | '+payment.reference,root_message_id:'<root@test>',last_message_id:'<previous@test>'}]);
    if(url.includes('bookings?'))return Response.json([{id,space_id:id,payment_gateway:'dummy',start_at:payment.start_at,end_at:payment.end_at,amount:10000,amount_paid:0,payment_deadline_at:payment.expires_at,internal_notes:'PRIVATE STAFF NOTE'}]);
    if(url.includes('spaces?'))return Response.json([{name:'Creator Space'}]);
    if(url.includes('org_settings?'))return Response.json([{payment_instructions:'Use the secure checkout below.'}]);
    if(url.includes('/ensure_dummy_reservation_payment')){assert.deepEqual(JSON.parse(options.body),{p_booking_id:id});return Response.json([payment])}
    if(url.includes('/record_reservation_email_result')){records.push(JSON.parse(options.body));return new Response(null,{status:204})}
    throw Error('Unexpected request');
  };
  const handler=emailHandler({env,fetchImpl,createTransportImpl:()=>({sendMail:async message=>{messages.push(message);return {accepted:message.to,rejected:[],messageId:message.messageId}},close(){}})});
  const response=await handler(new Request('https://trace.example.test/send',{method:'POST',headers:{Authorization:'Bearer staff-token'},body:JSON.stringify({booking_id:id,to:'attacker@example.test'})}));
  assert.equal(response.status,200);
  assert.deepEqual(messages[0].to,['customer@example.test']);
  assert.match(messages[0].text,/Your reservation has been approved, please make a half payment to confirm it/);
  assert.match(messages[0].text,/LKR 5000.00/);assert.match(messages[0].text,/No real money/);
  assert.match(messages[0].html,/href="https:\/\/trace.example.test\/#payment\//);
  assert.equal(messages[0].inReplyTo,'<previous@test>');assert.equal(records[0].p_parent,'<previous@test>');
  assert.doesNotMatch(JSON.stringify(messages),/PRIVATE STAFF NOTE|attacker@example|fake-service-key|signing-secret/);
  const signed=messages[0].text.match(/#payment\/([\w.-]+)/)[1];
  assert.deepEqual(verifyPaymentToken(signed,secret),{requestId,bookingId:id});
});

test('customer checkout exposes only a safe quote and uses the server-side completion RPC, never browser amounts',async()=>{
  const calls=[],emails=[];
  const handler=checkoutHandler({env,fetchImpl:async(url,options={})=>{
    calls.push({url,body:options.body&&JSON.parse(options.body)});
    if(url.includes('view_dummy_reservation_payment'))return Response.json([{...payment,internal_notes:'PRIVATE',customer_email:'PRIVATE EMAIL'}]);
    if(url.includes('complete_dummy_reservation_payment'))return Response.json([{booking_id:id,status:'confirmed'}]);
    if(url.includes('reservation_email_outbox'))return Response.json([{id,status:'pending'}]);
    throw Error('Unexpected request');
  },sendEmailImpl:async request=>{emails.push(await request.json());return Response.json({ok:true,status:'accepted'})}});
  const view=await (await handler(req('view'))).json();
  assert.equal(view.payment.amount_requested,5000);assert.equal(view.payment.gateway,'dummy');
  assert.doesNotMatch(JSON.stringify(view),/PRIVATE|booking_id|signing-secret|fake-service/);
  const paid=await handler(req('pay',{amount:1,status:'confirmed',booking_id:'forged'}));
  assert.deepEqual(await paid.json(),{ok:true,status:'confirmed',simulated:true,email_status:'accepted'});
  assert.deepEqual(calls.find(x=>x.url.includes('complete_dummy')).body,{p_request_id:requestId});
  assert.deepEqual(emails,[{outbox_id:id}]);
});

test('bad links and unavailable checkout cannot write or confirm a reservation',async()=>{
  let calls=0;
  const handler=checkoutHandler({env,fetchImpl:async()=>{calls++;return Response.json([{...payment,status:'cancelled'}])}});
  assert.equal((await handler(req('pay',{token:'forged'}))).status,410);assert.equal(calls,0);
  assert.equal((await handler(req('pay'))).status,409);assert.equal(calls,1);
  assert.equal((await checkoutHandler({env:{...env,PAYMENT_GATEWAY:'manual'}})(req('pay'))).status,503);
});

test('confirmation mail failure leaves a committed payment confirmed and retry-friendly',async()=>{
  const handler=checkoutHandler({env,fetchImpl:async url=>{
    if(url.includes('view_dummy'))return Response.json([payment]);
    if(url.includes('complete_dummy'))return Response.json([{booking_id:id,status:'already_paid'}]);
    return Response.json([{id,status:'pending'}]);
  },sendEmailImpl:async()=>Response.json({ok:false,code:'email_pending'},{status:502})});
  assert.deepEqual(await (await handler(req('pay'))).json(),{ok:true,status:'already_paid',simulated:true,email_status:'pending'});
});

test('database outages are retryable and queued responses cannot masquerade as a confirmed payment',async()=>{
  const handler=checkoutHandler({env,fetchImpl:async()=>{throw Error('private upstream connection details')}});
  const response=await handler(req('pay'));
  assert.equal(response.status,503);assert.deepEqual(await response.json(),{ok:false,code:'checkout_unavailable'});
  await assert.rejects(requestCheckout('pay',token(),{fetchImpl:async()=>Response.json({ok:true,status:'queued'})}),/try again/);
});
