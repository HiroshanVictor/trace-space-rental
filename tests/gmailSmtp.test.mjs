import test from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import {emailSettings,sendProviderEmail,smtpMessageId} from '../netlify/functions/lib/email-provider.mjs';
import {createHandler as reservationHandler} from '../netlify/functions/send-reservation-email.mjs';
import {createHandler as staffHandler} from '../netlify/functions/notify-inquiry.mjs';
import {createHandler as legacyHandler} from '../netlify/functions/notify-booking.mjs';
import {bookingEmailResult} from '../src/reservationEmails.js';
import {buildConfig} from '../scripts/configure.mjs';

const id='123e4567-e89b-12d3-a456-426614174000';
// Deliberately fictitious credentials; no SMTP connection is made in this suite.
const env={EMAIL_PROVIDER:'gmail_smtp',SMTP_HOST:'smtp.gmail.com',SMTP_PORT:'465',SMTP_USER:'trace-test@gmail.com',SMTP_PASS:'fake-test-password',EMAIL_FROM_NAME:'TRACE Expert City Reservations',EMAIL_FROM_EMAIL:'trace-test@gmail.com',EMAIL_REPLY_TO:'trace-test@gmail.com',INQUIRY_TO_EMAIL:'frontdesk@example.test',SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fake-service-key'};
const inquiry={id,name:'Saved customer',email:'customer@example.test',space_id:id,start_at:'2030-11-01T10:00:00Z',end_at:'2030-11-01T14:00:00Z',notification_attempts:1};
const conversation=()=>({id,inquiry_id:id,reference:'TRC-SMTPTEST',subject:'TRACE Expert City | Space Reservation | TRC-SMTPTEST',customer_email:inquiry.email,root_message_id:null,last_message_id:null});
const request=(body,staff=false)=>new Request('https://site.test/send',{method:'POST',headers:staff?{Authorization:'Bearer staff-token'}:{},body:JSON.stringify({...body,to:'forged@example.test',customer_email:'forged@example.test'})});
const json=value=>Response.json(value);
const forbiddenFetch=async()=>{throw Error('Unexpected network request');};

function fixture({sendMail,history=[],direct=false,recordFails=false}={}){
  const c=conversation();if(direct)c.inquiry_id=null;
  const messages=[],results=[],options=[];
  let event='inquiry_received',claim=true;
  const booking={id,space_id:id,customer_email:inquiry.email,amount:10000,amount_paid:3000,payment_reference:'RECEIPT-TEST',internal_notes:'PRIVATE DO NOT SEND',start_at:inquiry.start_at,end_at:inquiry.end_at};
  const fetchImpl=async(url,init={})=>{
    assert.doesNotMatch(url,/api\.resend\.com/);
    if(url.includes('/auth/v1/user'))return json({id});
    if(url.includes('staff_accounts'))return json([{user_id:id}]);
    if(url.includes('/rpc/claim_')){
      if(!claim)return json([]);
      claim=false;
      return json([{id,conversation_id:id,inquiry_id:direct?null:id,booking_id:event==='inquiry_received'?null:id,event_type:event,idempotency_key:`test/${event}`}]);
    }
    if(url.includes('/rpc/record_reservation_email_result')){
      const result=JSON.parse(init.body);results.push(result);
      if(recordFails&&!result.p_error)return Response.json({error:'unavailable'},{status:503});
      if(!result.p_error){c.root_message_id||=result.p_message_id;c.last_message_id=result.p_message_id;}
      return new Response(null,{status:204});
    }
    if(url.includes('reservation_email_conversations'))return json([c]);
    if(url.includes('reservation_email_messages'))return json(history);
    if(url.includes('inquiries?'))return json([inquiry]);
    if(url.includes('bookings?'))return json([booking]);
    if(url.includes('spaces?'))return json([{name:'Creator Space'}]);
    if(url.includes('org_settings?'))return json([{payment_instructions:'Ask the front desk.'}]);
    throw Error(`Unexpected database request: ${url}`);
  };
  const createTransportImpl=opts=>{
    options.push(opts);
    return {sendMail:async message=>{messages.push(message);return sendMail?sendMail(message):{accepted:message.to,rejected:[],messageId:message.messageId};},close(){}};
  };
  return {handler:reservationHandler({env,fetchImpl,createTransportImpl}),messages,results,options,c,setEvent(next){event=next;claim=true;}};
}

test('Gmail readiness uses SMTP credentials, enforces matching From, and never falls back to Resend',()=>{
  assert.equal(emailSettings(env).provider,'gmail_smtp');
  for(const overrides of [{SMTP_PASS:''},{EMAIL_FROM_EMAIL:'someone-else@gmail.com'},{SMTP_HOST:'other.test'},{SMTP_PORT:'587'},{EMAIL_PROVIDER:'unknown'}])assert.equal(emailSettings({...env,...overrides}),null);
  const config=buildConfig({...env,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'});
  assert.equal(config.notifyInquiryEndpoint,'/.netlify/functions/notify-inquiry');
  assert.equal(config.reservationEmailEndpoint,'/.netlify/functions/send-reservation-email');
  assert.doesNotMatch(JSON.stringify(config),/SMTP|fake-test-password|fake-service-key|trace-test@gmail/);
});

test('all customer lifecycle events use the canonical recipient, stable subject and synchronous SMTP thread IDs',async()=>{
  const f=fixture();
  const events=['inquiry_received','advance_payment_requested','reservation_confirmed','reservation_cancelled','booking_completed','refund_recorded','payment_deadline_elapsed'];
  for(const [index,event] of events.entries()){
    const parent=f.c.last_message_id;
    f.setEvent(event);
    const response=await f.handler(request(index?{booking_id:id}:{inquiry_id:id},index>0));
    assert.deepEqual(await response.json(),{ok:true,status:'accepted',thread_ready:true});
    const message=f.messages.at(-1),result=f.results.at(-1);
    assert.deepEqual(message.to,[inquiry.email]);
    assert.equal(message.from.address,env.SMTP_USER);assert.equal(message.from.name,env.EMAIL_FROM_NAME);
    assert.equal(message.replyTo,env.EMAIL_REPLY_TO);assert.equal(message.subject,f.c.subject);
    assert.equal(message.messageId,result.p_message_id);assert.equal(message.messageId,smtpMessageId(`test/${event}`,env.SMTP_USER));
    assert.match(result.p_provider_id,/^gmail_smtp:/);assert.notEqual(result.p_provider_id,result.p_message_id);
    assert.doesNotMatch(JSON.stringify(message),/PRIVATE DO NOT SEND|forged@example/);
    if(index){assert.equal(message.inReplyTo,parent);assert.ok(message.references.includes(f.c.root_message_id));assert.ok(message.references.includes(parent));}
    else assert.equal(message.inReplyTo,undefined);
  }
  for(const opts of f.options){assert.equal(opts.secure,true);assert.equal(opts.port,465);assert.equal(opts.logger,false);assert.equal(opts.debug,false);assert.equal(opts.tls.rejectUnauthorized,true);}
});

test('an unclaimed job never sends and a retry reuses its Message-ID',async()=>{
  const f=fixture();
  await f.handler(request({inquiry_id:id}));
  const response=await f.handler(request({inquiry_id:id}));
  assert.equal((await response.json()).status,'nothing_to_send');assert.equal(f.messages.length,1);
  f.setEvent('inquiry_received');await f.handler(request({inquiry_id:id}));
  assert.equal(f.messages[0].messageId,f.messages[1].messageId);
});

test('SMTP auth failure and recipient rejection preserve a retryable job and never expose credentials',async()=>{
  for(const sendMail of [async()=>{throw Object.assign(Error(`secret ${env.SMTP_PASS}`),{code:'EAUTH'});},async()=>({accepted:[],rejected:[inquiry.email]})]){
    const f=fixture({sendMail});
    const response=await f.handler(request({inquiry_id:id}));
    assert.equal(response.status,502);assert.equal((await response.json()).ok,false);
    assert.ok(['smtp_auth_failed','smtp_recipient_rejected'].includes(f.results[0].p_error));
    assert.doesNotMatch(JSON.stringify(f.results),/fake-test-password/);
  }
});

test('SMTP timeouts become safe retry codes and transport closes',async()=>{
  let closed=false;
  await assert.rejects(sendProviderEmail({env,fetchImpl:forbiddenFetch,idempotencyKey:'timeout',message:{to:inquiry.email,subject:'test',text:'test'},createTransportImpl:()=>({sendMail:async()=>{throw Object.assign(Error(env.SMTP_PASS),{code:'ETIMEDOUT'});},close:()=>{closed=true;}})}),/^Error: smtp_timeout$/);
  assert.equal(closed,true);
});

test('a database failure after SMTP acceptance is pending and recoverable, not reported as sent',async()=>{
  const f=fixture({recordFails:true});
  const response=await f.handler(request({inquiry_id:id}));
  assert.equal(response.status,502);assert.equal((await response.json()).ok,false);
  assert.equal(f.messages.length,1);assert.equal(f.results.at(-1).p_error,'database_unavailable');
  assert.equal(f.c.last_message_id,null);
});

test('invalid Gmail configuration cannot claim a job or contact SMTP',async()=>{
  let calls=0;
  const handler=reservationHandler({env:{...env,EMAIL_FROM_EMAIL:'wrong@gmail.com'},fetchImpl:async()=>{calls++;},createTransportImpl:()=>{calls++;}});
  assert.equal((await handler(request({inquiry_id:id}))).status,503);assert.equal(calls,0);
});

test('failed staff SMTP delivery records failure without modifying the saved inquiry details',async()=>{
  let patch;
  const handler=staffHandler({env,createTransportImpl:()=>({sendMail:async()=>{throw Error(env.SMTP_PASS);}}),fetchImpl:async(url,options)=>{
    if(url.includes('claim_inquiry_notification'))return json([inquiry]);
    assert.equal(options.method,'PATCH');patch=JSON.parse(options.body);return new Response(null,{status:204});
  }});
  const response=await handler(request({inquiry_id:id}));
  assert.equal(response.status,502);assert.equal(patch.notification_status,'failed');
  assert.equal(patch.notification_sent_at,null);assert.equal(patch.email,undefined);
  assert.doesNotMatch(JSON.stringify(patch),/fake-test-password/);
});

test('staff alerts use INQUIRY_TO_EMAIL and no browser-supplied recipient',async()=>{
  let sent,patch;
  const handler=staffHandler({env,createTransportImpl:()=>({sendMail:async message=>{sent=message;return {accepted:message.to,rejected:[],messageId:message.messageId};}}),fetchImpl:async(url,options)=>{
    if(url.includes('claim_inquiry_notification'))return json([inquiry]);
    if(options.method==='PATCH'){patch=JSON.parse(options.body);return new Response(null,{status:204});}
    throw Error('Unexpected network');
  }});
  assert.equal((await handler(request({inquiry_id:id}))).status,200);
  assert.deepEqual(sent.to,[env.INQUIRY_TO_EMAIL]);assert.equal(patch.notification_status,'sent');
});

test('legacy booking endpoint also uses Gmail and still requires staff authorization',async()=>{
  assert.equal(legacyHandler,reservationHandler);
  const f=fixture({direct:true});f.setEvent('advance_payment_requested');
  assert.equal((await f.handler(request({booking_id:id}))).status,401);
  assert.equal((await f.handler(request({booking_id:id},true))).status,200);
  assert.deepEqual(f.messages[0].to,[inquiry.email]);
});

test('booking authorization failures cannot claim or send a customer email',async()=>{
  let sends=0;
  const handler=reservationHandler({env,createTransportImpl:()=>{sends++;},fetchImpl:async url=>url.includes('/auth/v1/user')?json({id}):json([])});
  assert.equal((await handler(request({booking_id:id}))).status,401);
  assert.equal((await handler(request({booking_id:id},true))).status,403);
  assert.equal((await handler(request({outbox_id:id}))).status,401);
  assert.equal(sends,0);
});

test('direct staff bookings can start an SMTP thread without waiting for Resend',async()=>{
  const f=fixture({direct:true});f.setEvent('advance_payment_requested');
  assert.equal((await f.handler(request({booking_id:id},true))).status,200);
  assert.ok(f.c.root_message_id);assert.equal(f.messages[0].inReplyTo,undefined);
});

test('a genuine missing historical parent remains pending rather than fabricating a thread',async()=>{
  const f=fixture({history:[{rfc_message_id:null}]});f.setEvent('reservation_confirmed');
  const response=await f.handler(request({booking_id:id},true));
  assert.equal((await response.json()).status,'awaiting_thread');assert.equal(f.messages.length,0);
});

test('Nodemailer renders the expected Message-ID and thread headers without any SMTP network access',async()=>{
  let raw;
  const inMemory=nodemailer.createTransport({streamTransport:true,buffer:true,newline:'unix'});
  const parent='<root@example.test>';
  const result=await sendProviderEmail({env,fetchImpl:forbiddenFetch,idempotencyKey:'mime-test',message:{to:inquiry.email,subject:'TRACE Expert City | Space Reservation | TRC-TEST',text:'Testing only',threading:{parent,references:[parent]}},createTransportImpl:()=>({sendMail:async message=>{
    const info=await inMemory.sendMail(message);raw=info.message.toString().replace(/\r?\n[ \t]+/g,' ');return {...info,accepted:message.to,rejected:[]};
  }})});
  assert.ok(raw.includes(`Message-ID: ${result.rfcMessageId}`));assert.match(raw,/In-Reply-To: <root@example.test>/);assert.match(raw,/References: <root@example.test>/);
  assert.doesNotMatch(raw,/fake-test-password/);
});

test('the UI never reports queued, waiting, no-op, or failed email as sent',()=>{
  for(const status of ['awaiting_thread','nothing_to_send','queued','pending','failed'])assert.notEqual(bookingEmailResult({ok:true},{ok:true,status}).status,'sent');
  assert.equal(bookingEmailResult({ok:true},{ok:true,status:'accepted'}).status,'sent');
  assert.equal(bookingEmailResult({ok:false,status:502},{ok:false}).status,'failed');
});
