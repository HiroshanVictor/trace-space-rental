// Browser-only fixtures. No Supabase write, real email or payment network traffic.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium} from 'playwright';

const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
const origin=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
let browser,page;
const errors=[],external=[];
try{
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject)});
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
  const context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'Asia/Colombo'});
  let cloudMode=false,paid=false,failPayment=false,payAttempts=0;
  const view={reference:'TRC-CHECKOUT',space_name:'Creator Space',start_at:'2030-11-04T03:30:00Z',end_at:'2030-11-04T05:30:00Z',total:16000,amount_requested:8000,balance_after_payment:8000,expires_at:'2030-11-03T03:30:00Z',gateway:'dummy'};
  await context.route('**/*',async route=>{
    const url=route.request().url();
    if(url===`${origin}/config.js`)return route.fulfill({contentType:'text/javascript',body:`window.SPACE_RENTAL_CONFIG={paymentGateway:'dummy',${cloudMode?"supabaseUrl:'https://not-called.supabase.co',supabaseAnonKey:'sb_publishable_test'":''}};`});
    if(url===`${origin}/.netlify/functions/reservation-payment`){
      const body=route.request().postDataJSON();
      if(body.token==='invalid')return route.fulfill({status:410,json:{ok:false,code:'invalid_or_expired_link'}});
      if(body.action==='view')return route.fulfill({json:{ok:true,payment:{...view,status:paid?'paid':'pending'}}});
      assert.deepEqual(body,{action:'pay',token:'browser-test-token'});payAttempts++;
      if(failPayment)return route.fulfill({status:503,json:{ok:false,code:'checkout_unavailable'}});
      paid=true;return route.fulfill({json:{ok:true,status:'confirmed',simulated:true,email_status:'pending'}});
    }
    if(url.includes('.supabase.co')||url.includes('esm.sh/')||url.includes('/.netlify/functions/')){external.push(url);return route.abort()}
    return url.startsWith(origin)?route.continue():route.abort();
  });
  page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin);await page.locator('.public-page').waitFor();
  await page.evaluate(()=>sessionStorage.setItem('tec-demo-admin','1'));
  await page.goto(`${origin}/?staff-checkout#bookings`);
  await page.locator('[data-action="new-booking"]').click();
  const form=page.locator('form[data-form="booking"]');
  assert.equal(await form.locator('[name="status"]').isDisabled(),true);
  assert.equal(await form.locator('[name="amount_paid"]').evaluate(el=>el.readOnly),true);
  assert.equal(await form.locator('[name="customer_email"]').evaluate(el=>el.required),true);
  await form.locator('[name="customer_name"]').fill('Checkout approval customer');
  await form.locator('[name="customer_email"]').fill('checkout@example.test');
  await form.locator('[name="event_nature"]').fill('Workshop');
  await form.locator('[name="start_at"]').fill('2030-11-04T09:00');await form.locator('[name="end_at"]').fill('2030-11-04T11:00');
  await form.locator('button[type="submit"]').click();await form.waitFor({state:'hidden'});
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('tec-spacerental-v2')).bookings.find(row=>row.customer_name==='Checkout approval customer'));
  assert.equal(saved.payment_gateway,'dummy');assert.equal(saved.status,'pending');assert.equal(saved.amount_paid,0);assert.ok(saved.payment_deadline_at);
  await page.evaluate(spaceId=>{
    const key='tec-spacerental-v2',data=JSON.parse(localStorage.getItem(key));
    data.inquiries.unshift({id:'checkout-conversion',name:'Payment conversion customer',email:'conversion@example.test',phone:'0771234567',space_id:spaceId,
      start_at:'2030-11-05T09:00:00+05:30',end_at:'2030-11-05T11:00:00+05:30',event_nature:'Workshop',status:'new',message:'Conversion check',created_at:new Date().toISOString()});
    localStorage.setItem(key,JSON.stringify(data));
  },saved.space_id);
  await page.goto(`${origin}/?staff-payment-conversion#inquiries`);
  await page.locator('tr').filter({hasText:'Payment conversion customer'}).locator('[data-action="convert-inquiry"]').click();
  const conversion=page.locator('form[data-form="booking"]');
  assert.doesNotMatch(await conversion.innerText(),/Pricing & payment record|Private staff notes|Dummy gateway/);
  assert.equal(await conversion.locator('[name="discount"],[name="amount_paid"],[name="payment_status"],[name="payment_method"],[name="internal_notes"]').count(),0);
  await conversion.locator('button[type="submit"]').click();await conversion.waitFor({state:'hidden'});
  const converted=await page.evaluate(()=>JSON.parse(localStorage.getItem('tec-spacerental-v2')).bookings.find(row=>row.inquiry_id==='checkout-conversion'));
  assert.equal(converted.customer_email,'conversion@example.test');assert.equal(converted.status,'pending');assert.equal(converted.payment_gateway,'dummy');
  assert.equal(converted.amount_paid,0);assert.equal(converted.discount,0);assert.equal(converted.amount,16000);assert.ok(converted.payment_deadline_at);
  cloudMode=true; // Guest checkout must work without loading the Supabase SDK or staff data.
  await page.goto(`${origin}/?customer-checkout#payment/browser-test-token`);
  await page.locator('form[data-form="dummy-payment"]').waitFor();
  assert.match(await page.locator('.checkout-test').textContent(),/No real money/);
  assert.match(await page.locator('.checkout-card').textContent(),/LKR 8,000.00/);
  assert.equal(await page.locator('input').count(),1,'Checkout must never collect card/bank details');
  const submit=page.locator('form[data-form="dummy-payment"] button[type="submit"]');
  await submit.click();assert.equal(payAttempts,0,'Acknowledge test checkout before paying');
  await page.locator('[name="test_payment_ack"]').check();failPayment=true;
  await submit.click();await page.locator('.toast.error').waitFor();assert.equal(paid,false);
  assert.equal(await page.locator('.checkout-status.paid').count(),0);
  failPayment=false;await submit.click();await page.locator('.checkout-status.paid').waitFor();
  assert.equal(payAttempts,2);assert.equal(await page.locator('form[data-form="dummy-payment"]').count(),0);
  assert.match(await page.locator('.checkout-card').textContent(),/email is queued for retry/);
  await page.goto(`${origin}/?customer-reload#payment/browser-test-token`);
  await page.locator('.checkout-status.paid').waitFor();assert.equal(payAttempts,2);
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await page.goto(`${origin}/?customer-invalid#payment/invalid`);
  await page.locator('[role="alert"]').waitFor();assert.match(await page.locator('[role="alert"]').textContent(),/invalid or has expired/);
  assert.equal(await page.locator('form[data-form="dummy-payment"]').count(),0);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('Dummy payment browser checks passed: staff approval stays pending, customer link, 50% quote, test acknowledgement, failure/retry, confirmed receipt, reload, invalid links and mobile. No real emails or charges.');
}catch(error){console.error('Browser errors:',errors);if(page)console.error((await page.locator('body').innerText()).slice(0,1800));throw error}
finally{await browser?.close();server.kill()}
