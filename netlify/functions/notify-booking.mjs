/** Customer booking email. A staff token authorizes a server-side read of the saved booking. */
export function createHandler({env=process.env,fetchImpl=globalThis.fetch}={}){
 return async req=>{
  const reply=(status,body,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}});
  if(req.method!=='POST')return reply(405,{ok:false,code:'method_not_allowed'},{Allow:'POST'});
  let id;
  try{
   const raw=await req.text();if(raw.length>1024)return reply(413,{ok:false,code:'request_too_large'});
   id=JSON.parse(raw)?.booking_id;
  }catch{return reply(400,{ok:false,code:'invalid_request'});}
  if(typeof id!=='string'||!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(id))return reply(400,{ok:false,code:'invalid_booking'});
  const token=req.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if(!token)return reply(401,{ok:false,code:'staff_login_required'});
  const {SUPABASE_URL:url,SUPABASE_SERVICE_ROLE_KEY:serviceKey,RESEND_API_KEY:emailKey,RESEND_FROM_EMAIL:sender}=env;
  if(!url||!serviceKey||!emailKey||!sender)return reply(503,{ok:false,code:'not_configured'});
  const base=url.replace(/\/$/,'');
  const serviceHeaders={apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'};
  const db=async(path,options={})=>{
   const res=await fetchImpl(`${base}/rest/v1/${path}`,{...options,headers:{...serviceHeaders,...options.headers},signal:AbortSignal.timeout(8000)});
   if(!res.ok)throw Error('database');return res.status===204?null:res.json();
  };
  let booking;
  try{
   const user=await fetchImpl(`${base}/auth/v1/user`,{headers:{apikey:serviceKey,Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(8000)});
   if(!user.ok)return reply(401,{ok:false,code:'staff_login_required'});
   const account=await user.json();
   if(!/^[a-f\d-]{36}$/i.test(account?.id||''))return reply(401,{ok:false,code:'staff_login_required'});
   const staff=await db(`staff_accounts?user_id=eq.${account.id}&select=user_id`);
   if(!staff?.length)return reply(403,{ok:false,code:'staff_access_required'});
   const claimed=await db('rpc/claim_booking_confirmation',{method:'POST',body:JSON.stringify({p_id:id})});
   booking=claimed?.[0];
   if(!booking){
    const records=await db(`bookings?id=eq.${id}&select=confirmation_email_status,status`);
    if(!records?.length)return reply(404,{ok:false,code:'booking_unavailable'});
    if(records[0].confirmation_email_status==='sent')return reply(200,{ok:true,status:'sent'});
    return reply(429,{ok:false,code:'retry_later'},{'Retry-After':'60'});
   }
  }catch{return reply(503,{ok:false,code:'database_unavailable'});}
  const clean=(value,max=200)=>String(value??'').replace(/[\r\n\t]/g,' ').slice(0,max);
  let spaceName='TRACE space',spaceType='meeting';
  try{const spaces=await db(`spaces?id=eq.${booking.space_id}&select=name,type`);spaceName=spaces?.[0]?.name||spaceName;spaceType=spaces?.[0]?.type||spaceType;}catch{/* Email still contains the booking reference. */}
  const advance=Math.ceil(Number(booking.amount)*(spaceType==='auditorium'?0.5:0.25));
  const complete=booking.status==='confirmed'&&Number(booking.amount_paid)>=advance;
  const copies={
   en:{confirmed:'Booking confirmed',pending:'Booking recorded — advance required',reference:'Reference',space:'Space',start:'Start',end:'End',total:'Estimated total',advance:'Advance required',paid:'Payment recorded',complete:'Your advance is recorded. Please coordinate final event details with TRACE management.',provisional:'This slot is provisionally held. The reservation is complete only after TRACE records your advance payment. Ask management for the payment deadline.',terms:'Tell TRACE management about outside services and any alcohol. Food is not provided; alcohol may be brought only with approval and cannot be sold.',cancel:'To cancel, call TRACE and then send an official email. TRACE reviews refunds and any late fee.',note:'This message is a booking record, not a tax invoice.'},
   si:{confirmed:'වෙන්කිරීම තහවුරු කරන ලදී',pending:'වෙන්කිරීම සටහන් කර ඇත — අත්තිකාරම අවශ්‍යයි',reference:'යොමුව',space:'ස්ථානය',start:'ආරම්භය',end:'අවසානය',total:'ඇස්තමේන්තු මුළු මුදල',advance:'අවශ්‍ය අත්තිකාරම',paid:'සටහන් කළ ගෙවීම',complete:'ඔබේ අත්තිකාරම සටහන් කර ඇත. අවසාන විස්තර TRACE කළමනාකාරිත්වය සමඟ තහවුරු කරන්න.',provisional:'මෙම වේලාව තාවකාලිකව රඳවා ඇත. TRACE අත්තිකාරම සටහන් කළ පසු පමණක් වෙන්කිරීම සම්පූර්ණ වේ. ගෙවීමේ අවසන් දිනය විමසන්න.',terms:'බාහිර සේවා සහ මත්පැන් ගැන TRACE කළමනාකාරිත්වයට දන්වන්න. ආහාර සපයන්නේ නැත; අනුමැතියෙන් මත්පැන් රැගෙන ආ හැකි නමුත් අලෙවි කළ නොහැක.',cancel:'අවලංගු කිරීමට TRACE වෙත ඇමතුමක් දී නිල ඊමේල් පණිවිඩයක් යවන්න. ආපසු ගෙවීම් සහ ප්‍රමාද ගාස්තු TRACE පරීක්ෂා කරයි.',note:'මෙය වෙන්කිරීමේ වාර්තාවකි; බදු ඉන්වොයිසියක් නොවේ.'},
   ta:{confirmed:'முன்பதிவு உறுதிசெய்யப்பட்டது',pending:'முன்பதிவு பதிவு செய்யப்பட்டது — முன்பணம் தேவை',reference:'குறிப்பு',space:'இடம்',start:'தொடக்கம்',end:'முடிவு',total:'மதிப்பிடப்பட்ட மொத்தம்',advance:'தேவையான முன்பணம்',paid:'பதிவான கட்டணம்',complete:'உங்கள் முன்பணம் பதிவு செய்யப்பட்டுள்ளது. இறுதி நிகழ்வு விவரங்களை TRACE நிர்வாகத்துடன் உறுதிசெய்யவும்.',provisional:'இந்த நேரம் தற்காலிகமாக ஒதுக்கப்பட்டுள்ளது. TRACE முன்பணத்தைப் பதிவு செய்த பிறகே முன்பதிவு நிறைவு பெறும். கட்டணக் காலக்கெடுவை நிர்வாகத்திடம் கேளுங்கள்.',terms:'வெளிச் சேவைகள் மற்றும் மதுபானம் குறித்து TRACE நிர்வாகத்திடம் தெரிவிக்கவும். உணவு வழங்கப்படாது; அனுமதியுடன் மதுபானம் கொண்டு வரலாம், விற்க முடியாது.',cancel:'ரத்து செய்ய TRACE ஐ அழைத்து அதிகாரப்பூர்வ மின்னஞ்சல் அனுப்பவும். பணத்தைத் திருப்பித் தருவதையும் தாமதக் கட்டணத்தையும் TRACE பரிசீலிக்கும்.',note:'இது முன்பதிவுப் பதிவு; வரி ரசீது அல்ல.'}
  };
  const copy=copies[booking.preferred_language]||copies.en;
  const text=[
   complete?copy.confirmed:copy.pending,
   `${copy.reference}: ${clean(booking.reference)}`,
   `${copy.space}: ${clean(spaceName)}`,
   `${copy.start}: ${booking.start_at}`,
   `${copy.end}: ${booking.end_at}`,
   `${copy.total}: LKR ${Number(booking.amount).toFixed(2)}`,
   `${copy.advance}: LKR ${advance.toFixed(2)}`,
   `${copy.paid}: LKR ${Number(booking.amount_paid).toFixed(2)}`,
   complete?copy.complete:copy.provisional,copy.terms,copy.cancel,copy.note
  ].join('\n');
  let sent=false,code='provider_unreachable';
  try{
   const res=await fetchImpl('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${emailKey}`,'Content-Type':'application/json','Idempotency-Key':`booking/${id}/${booking.confirmation_email_version}`},body:JSON.stringify({from:sender,to:[booking.customer_email],subject:`TRACE ${clean(booking.reference)}: ${complete?copy.confirmed:copy.pending}`,text}),signal:AbortSignal.timeout(8000)});
   const result=await res.json().catch(()=>null);sent=res.ok&&typeof result?.id==='string'&&Boolean(result.id);code=res.ok?'invalid_provider_response':'provider_rejected';
  }catch{/* Status records uncertainty for staff retry. */}
  try{
   const updated=await db(`bookings?id=eq.${id}&confirmation_email_version=eq.${booking.confirmation_email_version}&confirmation_email_attempts=eq.${booking.confirmation_email_attempts}&select=id`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({confirmation_email_status:sent?'sent':'failed',confirmation_email_sent_at:sent?new Date().toISOString():null})});
   if(!updated?.length)return reply(409,{ok:false,code:'booking_changed'});
  }catch{return reply(502,{ok:false,code:'email_status_unavailable'});}
  return sent?reply(200,{ok:true,status:'sent'}):reply(502,{ok:false,code});
 };
}
export default createHandler();
export const config={path:'/.netlify/functions/notify-booking'};
