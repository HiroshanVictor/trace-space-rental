import {paymentSettings,verifyPaymentToken} from './lib/payment-links.mjs';
import {createHandler as emailHandler} from './send-reservation-email.mjs';

export function createHandler({env=process.env,fetchImpl=globalThis.fetch,sendEmailImpl,logger=console}={}){
  return async req=>{
    const reply=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
    if(req.method!=='POST')return reply(405,{ok:false,code:'method_not_allowed'});
    const settings=paymentSettings(env);
    if(!settings||!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)return reply(503,{ok:false,code:'checkout_not_configured'});
    let input;
    try{const raw=await req.text();if(raw.length>2048)return reply(413,{ok:false,code:'request_too_large'});input=JSON.parse(raw)}
    catch{return reply(400,{ok:false,code:'invalid_request'})}
    if(!['view','pay'].includes(input?.action))return reply(400,{ok:false,code:'invalid_request'});
    const token=verifyPaymentToken(input.token,settings.secret);
    if(!token)return reply(410,{ok:false,code:'invalid_or_expired_link'});
    const base=env.SUPABASE_URL.replace(/\/$/,''),key=env.SUPABASE_SERVICE_ROLE_KEY;
    const db=async(path,options={})=>{
      let response;
      try{response=await fetchImpl(`${base}/rest/v1/${path}`,{...options,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(10000)})}
      catch{throw Error('database_unavailable')}
      if(!response.ok)throw Error(response.status>=500?'database_unavailable':'payment_unavailable');
      try{return response.status===204?null:await response.json()}
      catch{throw Error('database_unavailable')}
    };
    const rpc=name=>db(`rpc/${name}`,{method:'POST',body:JSON.stringify({p_request_id:token.requestId})});
    let paid;
    try{
      const [view]=await rpc('view_dummy_reservation_payment');
      if(!view||view.booking_id!==token.bookingId)return reply(410,{ok:false,code:'invalid_or_expired_link'});
      if(!['pending','paid'].includes(view.status))return reply(409,{ok:false,code:'payment_unavailable'});
      if(input.action==='view')return reply(200,{ok:true,payment:{
        reference:view.reference,space_name:view.space_name,start_at:view.start_at,end_at:view.end_at,
        total:Number(view.total),amount_requested:Number(view.amount_requested),balance_after_payment:Number(view.balance_after_payment),
        expires_at:view.expires_at,status:view.status,currency:'LKR',gateway:'dummy'
      }});
      // No client-supplied amounts, recipient, booking status or payment result is trusted.
      [paid]=await rpc('complete_dummy_reservation_payment');
      if(!paid||paid.booking_id!==token.bookingId)throw Error('payment_unavailable');
    }catch(error){return reply(error.message==='database_unavailable'?503:409,{ok:false,code:error.message==='database_unavailable'?'checkout_unavailable':'payment_unavailable'})}
    let emailStatus='pending';
    try{
      const jobs=await db(`reservation_email_outbox?booking_id=eq.${token.bookingId}&event_type=eq.reservation_confirmed&select=id,status`);
      const job=jobs?.[0];
      if(job?.status==='accepted')emailStatus='accepted';
      else if(job&&env.SCHEDULER_SECRET){
        const send=sendEmailImpl||emailHandler({env,fetchImpl,logger});
        const response=await send(new Request(`${settings.origin}/.netlify/functions/send-reservation-email`,{
          method:'POST',headers:{'Content-Type':'application/json','x-reservation-scheduler-key':env.SCHEDULER_SECRET},body:JSON.stringify({outbox_id:job.id})
        }));
        const result=await response.json();
        if(response.ok&&result.status==='accepted')emailStatus='accepted';
      }
    }catch{/* Payment is committed. The existing outbox worker can retry the confirmation email. */}
    return reply(200,{ok:true,status:paid.status,simulated:true,email_status:emailStatus});
  };
}
export default createHandler();
export const config={path:'/.netlify/functions/reservation-payment'};
