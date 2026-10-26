import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {buildConfig,configure} from '../scripts/configure.mjs';

const publicConfig={SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
const jwt=role=>'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.signature';

test('configuration keeps demo mode and preserves manually configured projects',()=>{
  assert.deepEqual(buildConfig({}),{supabaseUrl:'',supabaseAnonKey:'',notifyInquiryEndpoint:'',reservationEmailEndpoint:''});
  const manual={supabaseUrl:publicConfig.SUPABASE_URL,supabaseAnonKey:jwt('anon'),notifyInquiryEndpoint:'/notify',reservationEmailEndpoint:'/reservation-email'};
  assert.deepEqual(buildConfig({},manual),manual);
});
test('configuration rejects partial projects, remote HTTP, and private server keys',()=>{
  assert.throws(()=>buildConfig({SUPABASE_URL:publicConfig.SUPABASE_URL}),/both/);
  assert.throws(()=>buildConfig({...publicConfig,SUPABASE_URL:'http://project.supabase.co'}),/HTTPS/);
  for(const key of [jwt('service_role'),'sb_secret_server-key','invalid'])assert.throws(()=>buildConfig({...publicConfig,SUPABASE_PUBLISHABLE_KEY:key}),/public publishable\/anon/);
  assert.throws(()=>buildConfig({...publicConfig,INQUIRY_NOTIFY_ENDPOINT:'https://another-site.test/email'}),/path on this website/);
});
test('only public values are generated and email needs complete server configuration',()=>{
  const incomplete=buildConfig({...publicConfig,RESEND_API_KEY:'private-provider-key'});
  assert.equal(incomplete.notifyInquiryEndpoint,'');
  const result=buildConfig({...publicConfig,SUPABASE_SERVICE_ROLE_KEY:'private-service-key',RESEND_API_KEY:'private-provider-key',INQUIRY_TO_EMAIL:'staff@example.test',RESEND_FROM_EMAIL:'sender@example.test'});
  assert.equal(result.notifyInquiryEndpoint,'/.netlify/functions/notify-inquiry');
  assert.equal(result.reservationEmailEndpoint,'');
  const conversations=buildConfig({...publicConfig,SUPABASE_SERVICE_ROLE_KEY:'private-service-key',RESEND_API_KEY:'private-provider-key',INQUIRY_TO_EMAIL:'staff@example.test',RESEND_FROM_EMAIL:'sender@example.test',RESEND_REPLY_TO_EMAIL:'desk@example.test'});
  assert.equal(conversations.reservationEmailEndpoint,'/.netlify/functions/send-reservation-email');
  assert.doesNotMatch(JSON.stringify(result),/private-provider-key|private-service-key|staff@example.test/);
});

test('deployment generator writes a usable browser config without any server secrets',async()=>{
  const temporary=await mkdtemp(join(tmpdir(),'tec-config-test-'));
  try{
    const path=join(temporary,'config.js');
    await writeFile(path,'window.SPACE_RENTAL_CONFIG = {supabaseUrl:"",supabaseAnonKey:"",notifyInquiryEndpoint:""};');
    await configure({env:{...publicConfig,SUPABASE_SERVICE_ROLE_KEY:'private-server-secret',RESEND_API_KEY:'private-email-secret',INQUIRY_TO_EMAIL:'staff@example.test',RESEND_FROM_EMAIL:'sender@example.test'},configPath:path});
    const generated=await readFile(path,'utf8');
    assert.match(generated,/sb_publishable_test/);assert.match(generated,/notify-inquiry/);
    assert.doesNotMatch(generated,/private-server-secret|private-email-secret|staff@example.test/);
  }finally{
    const target=resolve(temporary);
    assert.equal(dirname(target),resolve(tmpdir()));assert.ok(basename(target).startsWith('tec-config-test-'));
    await rm(target,{recursive:true,force:true});
  }
});
