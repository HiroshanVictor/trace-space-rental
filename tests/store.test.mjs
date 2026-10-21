import test from 'node:test';
import assert from 'node:assert/strict';

const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)}};
globalThis.window={SPACE_RENTAL_CONFIG:{notifyInquiryEndpoint:'/unused-notify'}};
globalThis.localStorage=memory();globalThis.sessionStorage=memory();
const {init,load,submitInquiry,retryInquiryEmail,inquiryEmailEnabled}=await import('../src/store.js');

test('demo inquiries remain inquiry-only, persist, and never call the email endpoint',async()=>{
  await init();const before=await load(true),originalFetch=globalThis.fetch;let requests=0;
  globalThis.fetch=async()=>{requests++;throw Error('Demo must not call external services')};
  try{
    const inquiry={name:'Local review',email:'local@example.test',phone:'0000',space_id:before.spaces[0].id,start_at:'2030-11-01T09:00:00Z',end_at:'2030-11-01T10:00:00Z',message:'Keep this request'};
    const result=await submitInquiry(inquiry);
    assert.equal(result.ok,true);assert.equal(result.notification.status,'not_configured');assert.ok(result.id);
    await init();const after=await load(true);
    assert.equal(after.inquiries.length,before.inquiries.length+1);assert.equal(after.bookings.length,before.bookings.length);
    assert.equal(after.inquiries.find(row=>row.id===result.id).message,'Keep this request');
    assert.deepEqual(await retryInquiryEmail(result.id),{status:'not_configured'});
    assert.equal(inquiryEmailEnabled(),false);assert.equal(requests,0);
  }finally{globalThis.fetch=originalFetch;}
});
