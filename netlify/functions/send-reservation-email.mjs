import {buildReservationEmail,threadHeaders,safeError} from './reservation-email-core.mjs';
const uuid=value=>typeof value==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
export function createHandler({env=process.env,fetchImpl=globalThis.fetch}={}){
 return async req=>{
  const reply=(status,body,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}});
  if(req.method!=='POST')return reply(405,{ok:false,code:'method_not_allowed'},{Allow:'POST'});
  let request;try{const raw=await req.text();if(raw.length>1024)return reply(413,{ok:false,code:'request_too_large'});request=JSON.parse(raw);}catch{return reply(400,{ok:false,code:'invalid_request'});}
  const {SUPABASE_URL:url,SUPABASE_SERVICE_ROLE_KEY:key,RESEND_API_KEY:resendKey,RESEND_FROM_EMAIL:from,RESEND_REPLY_TO_EMAIL:replyTo}=env;
  if(!url||!key||!resendKey||!from||!replyTo)return reply(503,{ok:false,code:'not_configured'});
  const base=url.replace(/\/$/,'');const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
  const db=async(path,options={})=>{const res=await fetchImpl(`${base}/rest/v1/${path}`,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(10000)});if(!res.ok)throw Error('database_unavailable');return res.status===204?null:res.json();};
  let outbox;
  try{
   if(uuid(request?.inquiry_id))outbox=(await db('rpc/claim_inquiry_reservation_email',{method:'POST',body:JSON.stringify({p_inquiry_id:request.inquiry_id})}))?.[0];
   else if(uuid(request?.booking_id)){
    const token=req.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];if(!token)return reply(401,{ok:false,code:'staff_login_required'});
    const user=await fetchImpl(`${base}/auth/v1/user`,{headers:{apikey:key,Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(8000)});const account=await user.json().catch(()=>null);if(!user.ok||!uuid(account?.id))return reply(401,{ok:false,code:'staff_login_required'});
    const staff=await db(`staff_accounts?user_id=eq.${account.id}&select=user_id`);if(!staff?.length)return reply(403,{ok:false,code:'staff_access_required'});
    outbox=(await db('rpc/claim_booking_reservation_email',{method:'POST',body:JSON.stringify({p_booking_id:request.booking_id})}))?.[0];
   }else if(uuid(request?.outbox_id)){
    if(!env.SCHEDULER_SECRET||req.headers.get('x-reservation-scheduler-key')!==env.SCHEDULER_SECRET)return reply(401,{ok:false,code:'scheduler_authorization_required'});
    outbox=(await db('rpc/claim_reservation_email_outbox',{method:'POST',body:JSON.stringify({p_id:request.outbox_id})}))?.[0];
   }else return reply(400,{ok:false,code:'invalid_request'});
  }catch{return reply(503,{ok:false,code:'database_unavailable'});}
  if(!outbox)return reply(200,{ok:true,status:'nothing_to_send'});
  try{
   const [conversation]=await db(`reservation_email_conversations?id=eq.${outbox.conversation_id}&select=*`);
   const [inquiry]=outbox.inquiry_id?await db(`inquiries?id=eq.${outbox.inquiry_id}&select=*`):[];
   const [booking]=outbox.booking_id?await db(`bookings?id=eq.${outbox.booking_id}&select=*`):[];
   const [space]=await db(`spaces?id=eq.${booking?.space_id||inquiry?.space_id}&select=name`);
   if(!conversation)throw Error('conversation_unavailable');
   const threading=threadHeaders(conversation);
   if(outbox.event_type!=='inquiry_received'&&!threading.parent){
    await db('rpc/record_reservation_email_result',{method:'POST',body:JSON.stringify({p_outbox:outbox.id,p_provider_id:'',p_message_id:'',p_parent:'',p_references:[],p_error:'awaiting_parent_message_id'})});
    return reply(202,{ok:true,status:'awaiting_thread'});
   }
   const message=buildReservationEmail({event:outbox.event_type,conversation,inquiry,booking,space,paymentInstructions:(await db('org_settings?id=eq.1&select=payment_instructions'))?.[0]?.payment_instructions||''});
   const sent=await fetchImpl('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json','Idempotency-Key':outbox.idempotency_key},body:JSON.stringify({from:`TRACE Expert City | Reservations <${from}>`,reply_to:replyTo,to:[conversation.customer_email],subject:message.subject,text:message.text,html:message.html,headers:threading.headers}),signal:AbortSignal.timeout(10000)});
   const accepted=await sent.json().catch(()=>null);if(!sent.ok||!accepted?.id)throw Error('provider_rejected');
   let rfcMessageId='';
   try{const lookup=await fetchImpl(`https://api.resend.com/emails/${accepted.id}`,{headers:{Authorization:`Bearer ${resendKey}`},signal:AbortSignal.timeout(8000)});const details=await lookup.json().catch(()=>null);if(lookup.ok&&typeof details?.message_id==='string')rfcMessageId=details.message_id;}catch{/* webhook will later supply the RFC Message-ID. */}
   await db('rpc/record_reservation_email_result',{method:'POST',body:JSON.stringify({p_outbox:outbox.id,p_provider_id:accepted.id,p_message_id:rfcMessageId,p_parent:threading.parent,p_references:threading.references,p_error:null})});
   return reply(200,{ok:true,status:'accepted',thread_ready:Boolean(rfcMessageId)});
  }catch(error){
   try{await db('rpc/record_reservation_email_result',{method:'POST',body:JSON.stringify({p_outbox:outbox.id,p_provider_id:'',p_message_id:'',p_parent:'',p_references:[],p_error:safeError(error)})});}catch{/* The preserved sending row is recoverable with its idempotency key. */}
   return reply(502,{ok:false,code:'email_pending'});
  }
 };
}
export default createHandler();
export const config={path:'/.netlify/functions/send-reservation-email'};
