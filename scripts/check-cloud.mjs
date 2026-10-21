import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {buildConfig} from './configure.mjs';

// Explicitly opt in to temporary writes against a staging project.
if(process.env.CLOUD_CHECK_ALLOW_WRITES!=='1'){
  console.error('Use a staging project and set CLOUD_CHECK_ALLOW_WRITES=1. This check creates and then deletes its own test records.');
  process.exitCode=1;
}else{
  const created={bookings:[],inquiries:[],spaces:[]};
  let publicConfig,token;
  const request=async(path,{method='GET',body,staff=false,allowFailure=false}={})=>{
    const response=await fetch(`${publicConfig.supabaseUrl}${path}`,{
      method,headers:{apikey:publicConfig.supabaseAnonKey,'Content-Type':'application/json',
        ...(staff?{Authorization:`Bearer ${token}`} : {}),...(method==='POST'?{Prefer:'return=representation'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok&&!allowFailure)throw Error(`Cloud check request failed (${response.status}) at ${path.split('?')[0]}. Verify schema, staff access and configuration.`);
    return {ok:response.ok,status:response.status,data};
  };
  try{
    publicConfig=buildConfig(process.env);
    assert.ok(publicConfig.supabaseUrl,'Set SUPABASE_URL and a public publishable/anon key.');
    assert.ok(process.env.SUPABASE_TEST_STAFF_EMAIL&&process.env.SUPABASE_TEST_STAFF_PASSWORD,'Set SUPABASE_TEST_STAFF_EMAIL and SUPABASE_TEST_STAFF_PASSWORD for an allowlisted staging staff account.');
    const auth=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:process.env.SUPABASE_TEST_STAFF_EMAIL,password:process.env.SUPABASE_TEST_STAFF_PASSWORD}});
    token=auth.data.access_token;
    const staff=await request(`/rest/v1/staff_accounts?user_id=eq.${auth.data.user.id}&select=user_id`,{staff:true});
    assert.equal(staff.data.length,1,'Test account must be allowlisted staff.');
    const spaceId=randomUUID();created.spaces.push(spaceId);
    await request('/rest/v1/spaces',{method:'POST',staff:true,body:{id:spaceId,name:`Cloud check ${spaceId}`,type:'meeting',capacity:4,inventory_count:1,rate_hour:1000,is_active:true}});
    const start=new Date(Date.now()+86400000),end=new Date(start.getTime()+3600000);
    const makeBooking=()=>({id:randomUUID(),reference:`CHECK-${randomUUID()}`,space_id:spaceId,customer_name:'Staging verification',customer_email:'staging@example.test',customer_phone:'',start_at:start.toISOString(),end_at:end.toISOString(),units_reserved:1,rate_type:'hour',amount:1000,amount_paid:0,status:'confirmed'});
    const candidates=[makeBooking(),makeBooking()];created.bookings.push(...candidates.map(row=>row.id));
    const attempts=await Promise.all(candidates.map(body=>request('/rest/v1/bookings',{method:'POST',staff:true,body,allowFailure:true})));
    assert.equal(attempts.filter(result=>result.ok).length,1,'Exactly one simultaneous overlapping booking must succeed.');
    const rejected=attempts.find(result=>!result.ok);
    assert.match(rejected.data?.message||'',/Time clash/,'The rejected booking must fail because of the overlap.');
    const winner=candidates[attempts.findIndex(result=>result.ok)];
    const adjacent={...makeBooking(),start_at:end.toISOString(),end_at:new Date(end.getTime()+3600000).toISOString()};created.bookings.push(adjacent.id);
    await request('/rest/v1/bookings',{method:'POST',staff:true,body:adjacent});
    const privateBooking=await request(`/rest/v1/bookings?id=eq.${winner.id}&select=id,customer_name`,{allowFailure:true});
    assert.ok(!privateBooking.ok||privateBooking.data.length===0,'Anonymous users must not read customer bookings.');
    const inquiryId=randomUUID();created.inquiries.push(inquiryId);
    // Minimal response is required: public users may INSERT but may not SELECT inquiries.
    const inquiryResponse=await fetch(`${publicConfig.supabaseUrl}/rest/v1/inquiries`,{
      method:'POST',headers:{apikey:publicConfig.supabaseAnonKey,'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify({id:inquiryId,name:'Staging inquiry',email:'staging@example.test',phone:'0000000000',space_id:spaceId,start_at:start.toISOString(),end_at:end.toISOString(),message:'Temporary verification record'}),signal:AbortSignal.timeout(15000)
    });
    assert.ok(inquiryResponse.ok,'Anonymous inquiry insert must succeed.');
    const staffInquiry=await request(`/rest/v1/inquiries?id=eq.${inquiryId}&select=id,notification_status`,{staff:true});
    assert.equal(staffInquiry.data[0]?.notification_status,'pending','Apply supabase/04_inquiry_notifications.sql before this check.');
    const privateInquiry=await request(`/rest/v1/inquiries?id=eq.${inquiryId}&select=id,email`,{allowFailure:true});
    assert.ok(!privateInquiry.ok||privateInquiry.data.length===0,'Anonymous users must not read inquiries.');
    const claim=await request('/rest/v1/rpc/claim_inquiry_notification',{method:'POST',body:{p_id:inquiryId},allowFailure:true});
    assert.ok(!claim.ok,'Public users must not have access to the server notification claim.');
    const bookings=await request(`/rest/v1/bookings?space_id=eq.${spaceId}&select=id`,{staff:true});
    assert.equal(bookings.data.length,2,'An inquiry must not create a reservation.');
    const schedule=await request('/rest/v1/rpc/public_space_schedule',{method:'POST',body:{p_from:start.toISOString(),p_to:new Date(start.getTime()+86400000).toISOString()}});
    assert.ok(schedule.data.some(event=>event.space_id===spaceId),'Public availability must show occupied times.');
    assert.ok(schedule.data.every(event=>!('customer_name'in event)&&!('email'in event)&&!('reference'in event)),'Public schedule must not expose private details.');
    console.log('Shared cloud checks passed: staff access, concurrent overlap rejection, adjacent bookings, public inquiries, private records, notification permissions and public availability. No email was sent.');
  }catch(error){console.error(error.message);process.exitCode=1;}
  finally{
    if(token){
      let cleanupFailed=false;
      for(const table of ['inquiries','bookings','spaces'])for(const id of created[table]){
        try{await request(`/rest/v1/${table}?id=eq.${id}`,{method:'DELETE',staff:true})}catch{cleanupFailed=true;console.error(`Could not remove test ${table} record ${id}.`);}
      }
      if(cleanupFailed)process.exitCode=1;else console.log('Temporary test records removed.');
    }
  }
}
