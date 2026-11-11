// Actual forms, isolated browser-local demo data, no Supabase or email requests.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium} from 'playwright';

const reservationKey='tec-spacerental-v2';
const socket=createServer();
await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
const origin=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
let browser;
let page;
const errors=[];
try{
  await new Promise((resolve,reject)=>{
    server.stdout.once('data',resolve);server.once('error',reject);
    server.once('exit',code=>reject(Error(`Local test server exited: ${code}`)));
  });
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  const unexpectedRequests=[];
  await context.route('**/*',route=>{
    const url=route.request().url();
    if(url===`${origin}/config.js`)return route.fulfill({contentType:'text/javascript',body:'window.SPACE_RENTAL_CONFIG={};'});
    if(url.includes('/.netlify/functions/')||url.includes('.supabase.co')){unexpectedRequests.push(url);return route.abort();}
    return url.startsWith(origin)?route.continue():route.abort();
  });
  page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  let navigation=0;
  const go=async route=>{await page.goto(`${origin}/?alcohol-ui=${++navigation}#${route}`);await page.locator('form[data-form],.data-table').first().waitFor();};
  const values=async()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),reservationKey);
  const group=form=>form.locator('[data-alcohol-fields]');
  const acknowledgement=form=>form.locator('[name="alcohol_terms_accepted"]');
  const choice=(form,value)=>form.locator(`[name="alcohol_planned"][value="${value}"]`);
  const save=async form=>{await form.locator('button[type="submit"]').click();await form.waitFor({state:'hidden'});};
  async function checkNo(form){
    assert.equal(await choice(form,'no').isChecked(),true);
    assert.equal(await acknowledgement(form).isVisible(),false);
    assert.equal(await acknowledgement(form).isChecked(),false);
    assert.equal(await acknowledgement(form).evaluate(el=>el.required),false);
  }
  async function checkAlignment(form){
    await group(form).scrollIntoViewIfNeeded();
    const layout=await group(form).locator('.alcohol-control').evaluateAll(labels=>labels.filter(el=>el.getBoundingClientRect().height).map(label=>{
      const input=label.querySelector('input').getBoundingClientRect(),span=label.querySelector('span').getBoundingClientRect();
      return {width:input.width,gap:span.left-input.right,top:Math.abs(span.top-input.top)};
    }));
    for(const item of layout){assert.ok(item.width<=22,JSON.stringify(item));assert.ok(item.gap>=0&&item.gap<=12,JSON.stringify(item));assert.ok(item.top<=5,JSON.stringify(item));}
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  }

  for(const declared of [false,true]){
    await go('request');let form=page.locator('form[data-form="inquiry"]');
    await checkNo(form);
    await form.locator('[name="name"]').fill(`Alcohol UI inquiry ${declared}`);
    await form.locator('[name="email"]').fill('alcohol-ui@example.test');
    await form.locator('[name="phone"]').fill('0771234567');
    await form.locator('[name="event_nature"]').fill('Test workshop');
    await choice(form,'yes').check();
    assert.equal(await acknowledgement(form).isChecked(),false);
    assert.equal(await acknowledgement(form).evaluate(el=>el.required&&!el.checkValidity()),true);
    await form.locator('button[type="submit"]').click();
    assert.equal(await page.locator('.terms-dialog').count(),0,'Unchecked Yes must not reach the terms dialog');
    await acknowledgement(form).check();

    for(const language of ['si','ta','en']){
      await page.locator('.public-header [data-language-toggle]').click();
      await page.locator(`.public-header [data-language="${language}"]`).click();
      form=page.locator('form[data-form="inquiry"]');
      assert.equal(await choice(form,'yes').isChecked(),true);
      assert.equal(await acknowledgement(form).isChecked(),true);
      assert.equal(await acknowledgement(form).evaluate(el=>el.required),true);
    }
    await choice(form,'no').check();await checkNo(form);
    if(declared){await choice(form,'yes').check();assert.equal(await acknowledgement(form).isChecked(),false);await acknowledgement(form).check();}
    await checkAlignment(form);await page.setViewportSize({width:390,height:844});await checkAlignment(form);
    await page.setViewportSize({width:1280,height:900});
    await form.locator('button[type="submit"]').click();
    await page.locator('[data-inquiry-terms-check]').check();
    await page.locator('[data-action="accept-inquiry-terms"]').click();
    await page.waitForFunction(()=>location.hash==='#catalog');
    const inquiry=(await values()).inquiries.find(row=>row.name===`Alcohol UI inquiry ${declared}`);
    assert.equal(inquiry.alcohol_planned,declared);assert.equal(inquiry.alcohol_terms_accepted,declared);
  }
  await page.evaluate(()=>sessionStorage.setItem('tec-demo-admin','1'));
  async function checkStaffForm(form){
    assert.equal(await form.locator('[data-alcohol-fields],input[name="alcohol_planned"],input[name="alcohol_terms_accepted"]').count(),0,
      'The alcohol choice and acknowledgement belong only on the customer form');
    assert.doesNotMatch(await form.innerText(),/Will alcohol be brought or consumed/);
  }
  for(const declared of [false,true]){
    await go('inquiries');
    const row=page.locator('tr').filter({hasText:`Alcohol UI inquiry ${declared}`});
    await row.locator('[data-action="view-inquiry"]').click();
    assert.equal(await page.locator('.detail-pair').filter({hasText:'Alcohol brought or consumed'}).locator('strong').textContent(),declared?'Yes':'No');
    await page.locator('.modal [data-action="close-modal"]').last().click();
    await row.locator('[data-action="convert-inquiry"]').click();
    const form=page.locator('form[data-form="booking"]');
    await checkStaffForm(form);
    const day=declared?'2030-11-05':'2030-11-04';
    await form.locator('[name="start_at"]').fill(`${day}T09:00`);await form.locator('[name="end_at"]').fill(`${day}T10:00`);
    await save(form);
    const record=(await values()).bookings.find(row=>row.customer_name===`Alcohol UI inquiry ${declared}`);
    assert.equal(record.alcohol_planned,declared);assert.equal(record.alcohol_terms_accepted,declared);
  }

  await go('bookings');
  for(const declared of [false,true]){
    const row=page.locator('tr').filter({hasText:`Alcohol UI inquiry ${declared}`});
    await row.locator('[data-action="edit-booking"]').click();
    const form=page.locator('form[data-form="booking"]');
    await checkStaffForm(form);
    await form.locator('[name="special_requests"]').fill('Preserve the customer declaration');await save(form);
    const edited=(await values()).bookings.find(row=>row.customer_name===`Alcohol UI inquiry ${declared}`);
    assert.equal(edited.alcohol_planned,declared);assert.equal(edited.alcohol_terms_accepted,declared);
    await row.locator('button[data-action="view-booking"]').click();
    assert.equal(await page.locator('.detail-pair').filter({hasText:'Alcohol brought or consumed'}).locator('strong').textContent(),declared?'Yes':'No');
    assert.equal(await page.locator('.detail-pair').filter({hasText:'Alcohol conditions acknowledged'}).locator('strong').textContent(),declared?'Yes':'No');
    await page.locator('.modal [data-action="close-modal"]').last().click();
  }

  await page.locator('[data-action="new-booking"]').click();
  const form=page.locator('form[data-form="booking"]');
  await checkStaffForm(form);
  await page.setViewportSize({width:390,height:844});await checkStaffForm(form);
  await page.setViewportSize({width:1280,height:900});
  await form.locator('[name="customer_name"]').fill('Alcohol UI staff defaults');
  await form.locator('[name="customer_email"]').fill('staff-ui@example.test');
  await form.locator('[name="event_nature"]').fill('Staff test workshop');
  await form.locator('[name="start_at"]').fill('2030-11-06T09:00');await form.locator('[name="end_at"]').fill('2030-11-06T10:00');
  await save(form);
  const saved=(await values()).bookings.find(row=>row.customer_name==='Alcohol UI staff defaults');
  assert.equal(saved.alcohol_planned,false);assert.equal(saved.alcohol_terms_accepted,false);
  assert.deepEqual(unexpectedRequests,[]);assert.deepEqual(errors,[]);
  console.log('Alcohol browser checks passed: customer-only Yes/No and conditional acknowledgement, language restoration, no staff alcohol controls, saved values preserved through conversion/editing, staff creation defaults, read-only details and desktop/mobile alignment. No cloud writes or email calls.');
}catch(error){
  console.error('Browser errors:',errors);
  if(page)console.error('Visible page:',(await page.locator('body').innerText()).slice(0,1800));
  throw error;
}finally{await browser?.close();server.kill();}
