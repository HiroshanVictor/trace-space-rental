import {makeSeed,id} from './data.js';
import {availabilityFor,validateBooking,validateSpace,intersects} from './engine.js';
import {dayBounds,publicFromRecords} from './publicAvailability.js';
import {summarizeBookingCounts,summarizeSpaceActivity} from './publicActivity.js';
import {notifyInquiry} from './inquiryNotifications.js';
import {sendInquiryReservationEmail} from './reservationEmails.js';
const KEY='tec-spacerental-v2';
const config=window.SPACE_RENTAL_CONFIG||{};
let cloudClient=null;
let cloudAuth=false;
export const cloudEnabled=Boolean(config.supabaseUrl && config.supabaseAnonKey);
export const isCloud=()=>cloudEnabled;
export const inquiryEmailEnabled=()=>cloudEnabled && Boolean(config.notifyInquiryEndpoint);
export const reservationEmailEnabled=()=>cloudEnabled && Boolean(config.reservationEmailEndpoint);
export const bookingEmailEnabled=()=>reservationEmailEnabled();
let localData;
function readDemo(){
  try {const parsed=JSON.parse(localStorage.getItem(KEY)); if(parsed?.spaces && parsed?.bookings) return parsed;}catch(_){}
  return makeSeed();
}
function saveDemo(){localStorage.setItem(KEY,JSON.stringify(localData));}
function clone(value){return structuredClone(value);}
async function client(){
  if (!cloudClient){
    let createClient;
    try {({createClient}=await import('https://esm.sh/@supabase/supabase-js@2.75.0'));}
    catch {throw Error('Could not load Supabase SDK. Check your internet connection or use the local demo.');}
    cloudClient=createClient(config.supabaseUrl,config.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true}});
  }
  return cloudClient;
}
async function query(table,method,payload,idValue){
  const sup=await client(); let q=sup.from(table);
  if(method==='list') q=q.select('*');
  else if(method==='insert') q=q.insert(payload).select().single();
  else if(method==='update') q=q.update(payload).eq('id',idValue).select().single();
  else if(method==='delete') q=q.delete().eq('id',idValue);
  const {data,error}=await q;
  if(error) throw Error(error.message);
  return data;
}
export async function init(){
  if(!cloudEnabled){localData=readDemo();saveDemo();return {admin:sessionStorage.getItem('tec-demo-admin')==='1'};}
  const sup=await client();const {data:{session}}=await sup.auth.getSession();
  cloudAuth=!!session && await verifyStaff(session.user.id);
  return {admin:cloudAuth};
}
async function verifyStaff(userId){
  const sup=await client(); const {data,error}=await sup.from('staff_accounts').select('user_id').eq('user_id',userId).maybeSingle();
  return !error&&!!data;
}
export async function signIn(email,password){
  if(!cloudEnabled){sessionStorage.setItem('tec-demo-admin','1');return;}
  const sup=await client();const {data,error}=await sup.auth.signInWithPassword({email,password});
  if(error) throw Error(error.message);
  cloudAuth=await verifyStaff(data.user.id);
  if(!cloudAuth){await sup.auth.signOut();throw Error('This account does not have staff access. Ask your Supabase administrator to allowlist this user.');}
}
export async function signOut(){
  if(!cloudEnabled){sessionStorage.removeItem('tec-demo-admin');return;}
  const sup=await client();await sup.auth.signOut();cloudAuth=false;
}
export async function load(admin){
  if(!cloudEnabled) return clone(localData);
  const sup=await client();
  const tables=admin?['spaces','bookings','customers','inquiries','blackouts','org_settings']:['spaces','org_settings'];
  const res=await Promise.all(tables.map(async t=>{const {data,error}=await sup.from(t).select('*');if(error)throw Error(`Loading ${t}: ${error.message}`);return [t,data]}));
  const result=Object.fromEntries(res);
  result.settings=result.org_settings?.[0]||{id:1,company_name:'Trace Expert City',email:'',phone:'',address:'Sri Lanka',currency:'LKR',opening_hours:'8:00 AM – 8:00 PM',about:''};
  for(const t of ['spaces','bookings','customers','inquiries','blackouts']) if(!result[t])result[t]=[];
  return result;
}
/** Safe anonymous schedule: public RPC returns dates, venue IDs and desk counts only. */
export async function loadPublicSchedule(day){
  const {start,end}=dayBounds(day);
  if(!cloudEnabled)return publicFromRecords(localData,start,end);
  const sup=await client();
  const {data,error}=await sup.rpc('public_space_schedule',{p_from:start,p_to:end});
  if(error) throw Error(`Public availability could not load: ${error.message}. If your Supabase project predates this feature, run supabase/03_public_availability.sql in the SQL Editor.`);
  return (data||[]).map(row=>({
    space_id:row.space_id,start_at:row.start_at,end_at:row.end_at,
    kind:row.kind,units_reserved:Number(row.units_reserved||0)
  }));
}
export async function loadPublicSpaceActivity(){
  if(!cloudEnabled)return summarizeSpaceActivity(localData.spaces,localData.bookings);
  const sup=await client();
  const {data,error}=await sup.rpc('public_space_activity');
  if(error)throw Error(`Booking activity could not load: ${error.message}. Run supabase/11_public_space_activity.sql in the SQL Editor.`);
  return (data||[]).map(row=>({
    space_id:row.space_id,
    booking_count:Number(row.booking_count||0),
    latest_booking_at:row.latest_booking_at||null
  }));
}
export async function loadPublicBookingCounts(){
  if(!cloudEnabled)return summarizeBookingCounts(localData.bookings);
  const sup=await client();
  const {data,error}=await sup.rpc('public_booking_counts');
  if(error)throw Error(`Booking totals could not load: ${error.message}. Run supabase/11_public_space_activity.sql in the SQL Editor.`);
  const row=Array.isArray(data)?data[0]:data;
  return {
    total:Number(row?.total_bookings||0),
    month:Number(row?.monthly_bookings||0),
    year:Number(row?.yearly_bookings||0)
  };
}
function localSave(table,method,payload,idValue){
  if(table==='org_settings'){localData.settings={...localData.settings,...payload};saveDemo();return clone(localData.settings);}
  if(method==='insert'){
    const row={...payload,id:id(table.slice(0,3)),created_at:new Date().toISOString()};
    localData[table].unshift(row);saveDemo();return clone(row);
  }
  const index=localData[table].findIndex(x=>x.id===idValue);
  if(index===-1)throw Error('Record not found.');
  if(method==='delete'){localData[table].splice(index,1);saveDemo();return;}
  localData[table][index]={...localData[table][index],...payload};saveDemo();return clone(localData[table][index]);
}
export async function save(table,payload,recordId){
  const method=recordId?'update':'insert';
  if(table==='spaces')validateSpace(payload);
  if(table==='bookings'){
    const data=await load(true);
    const space=data.spaces.find(x=>x.id===payload.space_id);
    validateBooking({...payload,id:recordId},space,data.bookings,data.blackouts);
  }
  if(table==='blackouts'){
    const data=await load(true);
    if(!payload.space_id||!payload.start_at||!payload.end_at || !(new Date(payload.end_at)>new Date(payload.start_at)))throw Error('A valid space and date range are required.');
    if(data.bookings.some(b=>b.space_id===payload.space_id&&b.status!=='cancelled'&&intersects(b.start_at,b.end_at,payload.start_at,payload.end_at)))throw Error('This maintenance block overlaps an existing reservation. Cancel or move the reservation first.');
  }
  if(!cloudEnabled) return localSave(table,method,payload,recordId);
  if(table==='org_settings')return query(table,'update',payload,1);
  return query(table,method,payload,recordId);
}
export async function remove(table,recordId){
  if(!cloudEnabled){
    if(table==='spaces' && ['bookings','inquiries','blackouts'].some(t=>localData[t].some(r=>r.space_id===recordId)))throw Error('This space has history. Archive it instead of deleting it.');
    if(table==='customers' && localData.bookings.some(b=>b.customer_id===recordId))throw Error('This customer has reservations. Keep their record for history.');
    return localSave(table,'delete',null,recordId);
  }
  return query(table,'delete',null,recordId);
}
export async function submitInquiry(payload){
  if(!cloudEnabled){
    const row=localSave('inquiries','insert',{...payload,status:'new',notification_status:'not_configured'});
    return {ok:true,id:row.id,notification:{status:'not_configured'}};
  }
  const sup=await client();
  const inquiryId=crypto.randomUUID();
  // Use a caller-generated ID: anonymous INSERT is allowed, private SELECT is not.
  const {error}=await sup.from('inquiries').insert({...payload,id:inquiryId,status:'new'});
  if(error)throw Error(error.message);
  const notification=await notifyInquiry(config.notifyInquiryEndpoint,inquiryId);
  // A staff alert and the customer's conversation root are independent durable jobs.
  // The inquiry stays saved if either network response is lost.
  const reservationEmail=await sendInquiryReservationEmail(config.reservationEmailEndpoint,inquiryId);
  return {ok:true,id:inquiryId,notification,reservationEmail};
}
export async function retryInquiryEmail(inquiryId){
  if(!inquiryEmailEnabled())return {status:'not_configured'};
  const [staffNotification]=await Promise.all([
    notifyInquiry(config.notifyInquiryEndpoint,inquiryId),
    sendInquiryReservationEmail(config.reservationEmailEndpoint,inquiryId)
  ]);
  return staffNotification;
}
export async function sendBookingConfirmation(bookingId){
  if(!bookingEmailEnabled())return {status:'not_configured'};
  const sup=await client();
  const {data:{session}}=await sup.auth.getSession();
  if(!session?.access_token)return {status:'failed'};
  try{
    const response=await fetch('/.netlify/functions/send-reservation-email',{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},
      body:JSON.stringify({booking_id:bookingId}),signal:AbortSignal.timeout(12000)
    });
    const body=await response.json().catch(()=>null);
    return response.ok&&body?.ok&&['accepted','nothing_to_send','awaiting_thread'].includes(body.status)?{status:'sent'}:{status:response.status===503&&body?.code==='not_configured'?'not_configured':'failed'};
  }catch{return {status:'pending'};}
}
export function demoReset(){if(cloudEnabled)throw Error('Reset is for demo mode only.');localData=makeSeed();saveDemo();}
export async function currentUserEmail(){
  if(!cloudEnabled)return 'demo@traceexpertcity.local';
  const sup=await client();const {data:{user}}=await sup.auth.getUser();return user?.email||'';
}
