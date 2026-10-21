import test from 'node:test';
import assert from 'node:assert/strict';
import {notifyInquiry} from '../src/inquiryNotifications.js';
import {createHandler} from '../netlify/functions/notify-inquiry.mjs';

const id='12345678-1234-4234-8234-123456789abc';
const saved={id,name:'Saved customer',email:'saved@example.test',phone:'0000',space_id:'room',start_at:'2030-11-01T09:00:00Z',end_at:'2030-11-01T10:00:00Z',message:'Saved message',notification_attempts:1};
const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-test-key',RESEND_API_KEY:'provider-test-key',INQUIRY_TO_EMAIL:'staff@example.test',RESEND_FROM_EMAIL:'sender@example.test'};
const request=(body={inquiry_id:id})=>new Request('https://site.test/notify',{method:'POST',body:JSON.stringify(body)});
const json=(value,status=200)=>Response.json(value,{status});

test('client distinguishes an accepted email, HTTP errors, unconfigured email, and lost responses',async()=>{
  let calls=0;
  assert.deepEqual(await notifyInquiry('',id,{fetchImpl:()=>{calls++;}}),{status:'not_configured'});
  assert.equal(calls,0);
  for(const [response,status] of [
    [json({ok:true,status:'sent'}),'sent'],[json({ok:false},502),'failed'],
    [json({ok:false,code:'not_configured'},503),'not_configured'],
    [json({ok:false},429),'pending'],[new Response('<html>Not a function</html>'),'failed']
  ])assert.deepEqual(await notifyInquiry('/notify',id,{fetchImpl:async()=>response}),{status});
  assert.deepEqual(await notifyInquiry('/notify',id,{fetchImpl:async()=>{throw Error('network')}}),{status:'pending'});
});

test('client sends only an inquiry ID and bounds a stalled request',async()=>{
  let sent;
  await notifyInquiry('/notify',id,{fetchImpl:async(url,options)=>{sent=JSON.parse(options.body);return json({ok:true,status:'sent'})}});
  assert.deepEqual(sent,{inquiry_id:id});
  const result=await notifyInquiry('/notify',id,{timeoutMs:5,fetchImpl:async(url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted'))))});
  assert.equal(result.status,'pending');
});

test('server refuses malformed requests and missing configuration without contacting external services',async()=>{
  let calls=0;const handler=createHandler({env:{},fetchImpl:()=>{calls++;throw Error('unexpected')}});
  assert.equal((await handler(new Request('https://site.test/notify'))).status,405);
  assert.equal((await handler(request({inquiry_id:'invalid'}))).status,400);
  assert.equal((await handler(new Request('https://site.test/notify',{method:'POST',body:'x'.repeat(1025)}))).status,413);
  assert.equal((await handler(request())).status,503);assert.equal(calls,0);
});

test('server emails the canonical saved inquiry and records successful acceptance',async()=>{
  const calls=[];
  const handler=createHandler({env,fetchImpl:async(url,options)=>{
    calls.push({url,...options});
    if(url.endsWith('/rpc/claim_inquiry_notification'))return json([saved]);
    if(url==='https://api.resend.com/emails')return json({id:'provider-message'});
    return new Response(null,{status:204});
  }});
  const response=await handler(request({inquiry_id:id,name:'Forged name',message:'Forged message',to:'attacker@example.test'}));
  assert.deepEqual(await response.json(),{ok:true,status:'sent'});
  const email=calls.find(call=>call.url==='https://api.resend.com/emails');
  assert.match(JSON.parse(email.body).text,/Saved message/);assert.doesNotMatch(email.body,/Forged|attacker/);
  assert.deepEqual(JSON.parse(email.body).to,['staff@example.test']);
  assert.equal(email.headers['Idempotency-Key'],`inquiry/${id}`);
  const patch=calls.find(call=>call.method==='PATCH');assert.equal(JSON.parse(patch.body).notification_status,'sent');
  assert.ok(patch.url.includes('notification_attempts=eq.1'));
});

test('rejected and unreachable providers persist failure without discarding the saved inquiry',async()=>{
  for(const fail of ['http','network','invalid_success']){
    let patched;
    const handler=createHandler({env,fetchImpl:async(url,options)=>{
      if(url.endsWith('/rpc/claim_inquiry_notification'))return json([saved]);
      if(url==='https://api.resend.com/emails'){if(fail==='network')throw Error('network');return json({message:'private provider error'},fail==='invalid_success'?200:429);}
      patched=JSON.parse(options.body);return new Response(null,{status:204});
    }});
    const response=await handler(request());assert.equal(response.status,502);
    assert.equal(patched.notification_status,'failed');assert.equal(patched.notification_sent_at,null);
    assert.doesNotMatch(await response.text(),/private provider error|server-test-key|provider-test-key/);
  }
});

test('already sent and in-progress inquiries cannot trigger duplicate emails',async()=>{
  for(const [status,expected] of [['sent',200],['sending',429]]){
    let sends=0;
    const handler=createHandler({env,fetchImpl:async(url)=>{
      if(url.endsWith('/rpc/claim_inquiry_notification'))return json([]);
      if(url.includes('/inquiries?'))return json([{notification_status:status}]);
      sends++;throw Error('Unexpected provider call');
    }});
    const response=await handler(request());assert.equal(response.status,expected);assert.equal(sends,0);
  }
});

test('database and status-write failures are never reported as a successful notification',async()=>{
  const unavailable=createHandler({env,fetchImpl:async()=>json({message:'private database detail'},500)});
  assert.equal((await unavailable(request())).status,503);
  const failedWrite=createHandler({env,fetchImpl:async(url)=>{
    if(url.endsWith('/rpc/claim_inquiry_notification'))return json([saved]);
    if(url==='https://api.resend.com/emails')return json({id:'provider-message'});
    return json({message:'write failed'},500);
  }});
  assert.equal((await failedWrite(request())).status,502);
});
