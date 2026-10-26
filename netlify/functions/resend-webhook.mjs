import {createHmac,timingSafeEqual} from 'node:crypto';

function verified(raw,headers,secret){
  const id=headers.get('svix-id'),timestamp=headers.get('svix-timestamp'),signature=headers.get('svix-signature');
  if(!id||!timestamp||!signature||!secret)return false;
  const key=secret.replace(/^whsec_/,'');let bytes;try{bytes=Buffer.from(key,'base64');}catch{return false;}
  const expected=createHmac('sha256',bytes).update(`${id}.${timestamp}.${raw}`).digest('base64');
  return signature.split(' ').some(part=>{const value=part.replace(/^v1,/,'');try{return timingSafeEqual(Buffer.from(value),Buffer.from(expected));}catch{return false;}});
}
export function createHandler({env=process.env,fetchImpl=globalThis.fetch}={}){
 return async req=>{
  if(req.method!=='POST')return Response.json({ok:false,code:'method_not_allowed'},{status:405,headers:{Allow:'POST'}});
  const raw=await req.text();if(raw.length>250000)return Response.json({ok:false,code:'request_too_large'},{status:413});
  if(!verified(raw,req.headers,env.RESEND_WEBHOOK_SECRET))return Response.json({ok:false,code:'invalid_signature'},{status:401});
  let event;try{event=JSON.parse(raw);}catch{return Response.json({ok:false,code:'invalid_payload'},{status:400});}
  const {SUPABASE_URL:url,SUPABASE_SERVICE_ROLE_KEY:key}=env;if(!url||!key)return Response.json({ok:false,code:'not_configured'},{status:503});
  const eventId=String(event?.id||'');const type=String(event?.type||'');const data=event?.data||{};const providerId=String(data.email_id||data.id||'');
  if(!eventId||!type)return Response.json({ok:false,code:'invalid_payload'},{status:400});
  const base=url.replace(/\/$/,'');const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
  const db=async(path,options={})=>{const response=await fetchImpl(`${base}/rest/v1/${path}`,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('database');return response.status===204?null:response.json();};
  try{
   const seen=await db(`reservation_email_webhook_events?provider_event_id=eq.${encodeURIComponent(eventId)}&select=provider_event_id`);if(seen?.length)return Response.json({ok:true,status:'duplicate'});
   await db('reservation_email_webhook_events',{method:'POST',body:JSON.stringify({provider_event_id:eventId,provider_email_id:providerId,event_type:type,payload:event})});
   // Inbound email is deliberately only logged. Replies continue to the monitored Reply-To inbox
   // until an explicitly configured inbound-mail workflow is approved.
   if(providerId&&type!=='email.received'){
    const status=type==='email.delivered'?'delivered':type==='email.bounced'?'bounced':type==='email.complained'?'complained':'accepted';
    await db(`reservation_email_messages?provider_email_id=eq.${encodeURIComponent(providerId)}`,{method:'PATCH',body:JSON.stringify({delivery_status:status,delivered_at:status==='delivered'?new Date().toISOString():null})});
    const messageId=typeof data.message_id==='string'?data.message_id:'';
    if(messageId){
      const messages=await db(`reservation_email_messages?provider_email_id=eq.${encodeURIComponent(providerId)}&select=conversation_id`);
      await db(`reservation_email_messages?provider_email_id=eq.${encodeURIComponent(providerId)}`,{method:'PATCH',body:JSON.stringify({rfc_message_id:messageId})});
      for(const item of messages||[])await db(`reservation_email_conversations?id=eq.${item.conversation_id}`,{method:'PATCH',body:JSON.stringify({root_message_id:messageId,last_message_id:messageId,updated_at:new Date().toISOString()})});
    }
   }
   return Response.json({ok:true});
  }catch{return Response.json({ok:false,code:'database_unavailable'},{status:503});}
 };
}
export default createHandler();
export const config={path:'/.netlify/functions/resend-webhook'};
