/** Send only a saved inquiry to the configured staff inbox. Secrets stay server-side. */
export function createHandler({env=process.env,fetchImpl=globalThis.fetch} = {}) {
  return async req=>{
    const reply=(status,body,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}});
    if(req.method!=='POST')return reply(405,{ok:false,code:'method_not_allowed'},{Allow:'POST'});
    let body;
    try{
      if(Number(req.headers.get('content-length')||0)>1024)return reply(413,{ok:false,code:'request_too_large'});
      const raw=await req.text();
      if(raw.length>1024)return reply(413,{ok:false,code:'request_too_large'});
      body=JSON.parse(raw);
    }catch{return reply(400,{ok:false,code:'invalid_request'});}
    const inquiryId=body?.inquiry_id;
    if(typeof inquiryId!=='string'||!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(inquiryId))return reply(400,{ok:false,code:'invalid_inquiry'});
    const {SUPABASE_URL:url,SUPABASE_SERVICE_ROLE_KEY:serviceKey,RESEND_API_KEY:emailKey,INQUIRY_TO_EMAIL:recipient,RESEND_FROM_EMAIL:sender}=env;
    if(!url||!serviceKey||!emailKey||!recipient||!sender)return reply(503,{ok:false,code:'not_configured'});
    const databaseHeaders={apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'};
    const database=async(path,options={})=>{
      const response=await fetchImpl(`${url.replace(/\/$/,'')}/rest/v1/${path}`,{
        ...options,headers:{...databaseHeaders,...options.headers},signal:AbortSignal.timeout(8000)
      });
      if(!response.ok)throw Error('Database operation failed');
      return response.status===204?null:response.json();
    };
    let inquiry;
    try{
      const rows=await database('rpc/claim_inquiry_notification',{method:'POST',body:JSON.stringify({p_id:inquiryId})});
      inquiry=rows?.[0];
      if(!inquiry){
        const records=await database(`inquiries?id=eq.${inquiryId}&select=notification_status`);
        if(records?.[0]?.notification_status==='sent')return reply(200,{ok:true,status:'sent'});
        if(!records?.length)return reply(404,{ok:false,code:'inquiry_unavailable'});
        return reply(429,{ok:false,code:'retry_later'},{'Retry-After':'60'});
      }
    }catch{return reply(503,{ok:false,code:'database_unavailable'});}
    const clean=(value,max=1000)=>String(value??'').replace(/[\r\n\t]/g,' ').slice(0,max);
    const text=[
      'New space-rental inquiry (not a confirmed booking)',
      `Inquiry: ${inquiry.id}`,`Name: ${clean(inquiry.name,120)}`,`Email: ${clean(inquiry.email,180)}`,
      `Phone: ${clean(inquiry.phone,60)}`,`Space ID: ${inquiry.space_id}`,
      `Requested start: ${inquiry.start_at}`,`Requested end: ${inquiry.end_at}`,
      `Message: ${clean(inquiry.message)}`,
      'Review the inquiry in the Trace Expert City staff portal before booking.'
    ].join('\n');
    let sent=false,errorCode='provider_unreachable';
    try{
      const response=await fetchImpl('https://api.resend.com/emails',{
        method:'POST',headers:{Authorization:`Bearer ${emailKey}`,'Content-Type':'application/json','Idempotency-Key':`inquiry/${inquiry.id}`},
        body:JSON.stringify({from:sender,to:[recipient],subject:`New space rental inquiry: ${clean(inquiry.name,120)}`,text}),
        signal:AbortSignal.timeout(8000)
      });
      const accepted=await response.json().catch(()=>null);
      sent=response.ok && typeof accepted?.id==='string' && Boolean(accepted.id);
      errorCode=response.ok?'invalid_provider_response':'provider_rejected';
    }catch{ /* Staff can retry uncertain results using the same idempotency key. */ }
    try{
      await database(`inquiries?id=eq.${inquiry.id}&notification_attempts=eq.${inquiry.notification_attempts}`,{
        method:'PATCH',body:JSON.stringify({notification_status:sent?'sent':'failed',notification_sent_at:sent?new Date().toISOString():null,notification_error:sent?'':errorCode})
      });
    }catch{return reply(502,{ok:false,code:'notification_status_unavailable'});}
    return sent?reply(200,{ok:true,status:'sent'}):reply(502,{ok:false,code:errorCode});
  };
}
export default createHandler();
export const config={path:'/.netlify/functions/notify-inquiry'};
