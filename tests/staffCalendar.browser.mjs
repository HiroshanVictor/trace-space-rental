// Browser-local fixtures only: no production database writes or email requests.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium} from 'playwright';
import {makeSeed} from '../src/data.js';

const socket=createServer();
await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
const origin=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
let browser,page;
const errors=[],external=[];
try{
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject)});
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
  const context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'Asia/Colombo'});
  await context.route('**/*',route=>{
    const url=route.request().url();
    if(url===`${origin}/config.js`)return route.fulfill({contentType:'text/javascript',body:'window.SPACE_RENTAL_CONFIG={};'});
    if(url.includes('.supabase.co')||url.includes('/.netlify/functions/')){external.push(url);return route.abort()}
    return url.startsWith(origin)?route.continue():route.abort();
  });
  const seed=makeSeed(),day='2030-11-04';
  const date=(day,hour)=>`${day}T${hour}:00:00+05:30`;
  const meeting=seed.spaces.find(s=>s.type==='meeting'),desk=seed.spaces.find(s=>s.type==='desk');
  const base=seed.bookings[0];
  const booking=(id,space,hour,end,status='confirmed')=>({...base,id,reference:`TRC-${id}`,space_id:space.id,
    customer_name:`Calendar ${id}`,start_at:date(day,hour),end_at:date(day,end),status});
  seed.bookings=[booking('morning',meeting,'09','11'),booking('early',meeting,'01','03'),
    booking('desk-a',desk,'09','17'),booking('desk-b',desk,'10','18','pending'),booking('cancelled',meeting,'12','14','cancelled')];
  seed.blackouts=[{id:'maintenance',space_id:meeting.id,start_at:date(day,'16'),end_at:date(day,'18'),reason:'Calendar maintenance'}];
  page=await context.newPage();page.on('pageerror',err=>errors.push(err.message));
  await page.goto(origin);
  await page.evaluate(seed=>{localStorage.setItem('tec-spacerental-v2',JSON.stringify(seed));sessionStorage.setItem('tec-demo-admin','1')},seed);
  await page.goto(`${origin}/?calendar-ui#calendar`);
  const selectDay=async day=>{await page.locator('[data-filter="calendar-day"]').fill(day);await page.locator('.staff-cal-grid').waitFor()};
  const close=async()=>page.locator('.modal [data-action="close-modal"]').last().click();
  await selectDay(day);
  assert.match(await page.locator('.staff-calendar-summary').textContent(),/4 reservations · 1 maintenance/);
  assert.equal(await page.locator('.staff-cal-hours span').count(),24);
  assert.equal(await page.locator('.staff-cal-event').count(),5);
  assert.equal(await page.locator('.staff-cal-event[data-id="cancelled"]').count(),0);
  const deskA=await page.locator('.staff-cal-event[data-id="desk-a"]').boundingBox();
  const deskB=await page.locator('.staff-cal-event[data-id="desk-b"]').boundingBox();
  assert.ok(deskA.width>0&&deskB.y>=deskA.y+deskA.height,'Overlapping desk reservations must stay visible on separate tracks');
  await page.locator('.staff-cal-event[data-id="morning"]').click();
  assert.match(await page.locator('.modal').innerText(),/Calendar morning/);await close();
  await page.locator('.staff-cal-event[data-id="maintenance"]').click();
  assert.equal(await page.locator('form[data-form="blackout"] [name="reason"]').inputValue(),'Calendar maintenance');await close();
  await page.locator(`[data-action="calendar-slot"][data-id="${meeting.id}"][data-hour="12"]`).click();
  assert.equal(await page.locator('form[data-form="booking"] [name="space_id"]').inputValue(),meeting.id);
  const form=page.locator('form[data-form="booking"]');
  assert.equal(await form.locator('[name="start_at"]').inputValue(),`${day}T12:00`);
  await form.locator('[name="customer_name"]').fill('Calendar created from grid');
  await form.locator('[name="customer_email"]').fill('calendar@example.test');
  await form.locator('[name="event_nature"]').fill('Calendar test workshop');
  await form.locator('button[type="submit"]').click();
  await form.waitFor({state:'hidden'});
  await page.locator('.staff-cal-event').filter({hasText:'Calendar created from grid'}).waitFor();
  await page.locator(`[data-action="calendar-slot"][data-id="${desk.id}"][data-hour="19"]`).click();
  assert.equal(await page.locator('form[data-form="booking"] [name="end_at"]').inputValue(),'2030-11-05T19:00');await close();
  await page.locator('[data-filter="calendar-space"]').selectOption(desk.id);
  assert.equal(await page.locator('.staff-cal-row').count(),1);
  assert.equal(await page.locator('.staff-cal-event').count(),2);
  await page.locator('[data-filter="calendar-space"]').selectOption('all');
  await page.locator('[data-action="calendar-next"]').click();
  await page.locator('.staff-calendar-empty').waitFor();
  assert.equal(await page.locator('[data-filter="calendar-day"]').inputValue(),'2030-11-05');
  assert.match(await page.locator('.staff-calendar-empty').textContent(),/Public inquiries/);
  await page.locator('[data-filter="calendar-day"]').fill('');
  assert.equal(await page.locator('[data-filter="calendar-day"]').inputValue(),'2030-11-05','Clearing the date must not crash the calendar');
  await page.locator('[data-action="calendar-prev"]').click();await page.locator('.staff-cal-event').first().waitFor();
  await page.evaluate(()=>{
    const key='tec-spacerental-v2',data=JSON.parse(localStorage.getItem(key));
    data.bookings=data.bookings.filter(row=>row.id!=='morning');localStorage.setItem(key,JSON.stringify(data));
  });
  await page.locator('[data-action="calendar-refresh"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('.staff-cal-event').length===5);
  assert.equal(await page.locator('.staff-cal-event[data-id="morning"]').count(),0);
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Timeline should scroll inside its container on mobile');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('Staff calendar browser checks passed: full-day events, overlapping bookings, details, maintenance editing, free-slot defaults, venue/date controls, refresh and mobile. No cloud writes or email calls.');
}catch(error){
  console.error('Browser errors:',errors);
  if(page)console.error((await page.locator('body').innerText()).slice(0,1600));
  throw error;
}finally{await browser?.close();server.kill()}
