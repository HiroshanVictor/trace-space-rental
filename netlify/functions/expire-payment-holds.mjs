import {createHandler as createEmailHandler} from './send-reservation-email.mjs';
export default async function handler(req,context){
  const env=process.env;
  const {SUPABASE_URL:url,SUPABASE_SERVICE_ROLE_KEY:key}=env;if(!url||!key||!env.SCHEDULER_SECRET)return new Response('Not configured',{status:503});
  const response=await fetch(`${url.replace(/\/$/,'')}/rest/v1/rpc/expire_payment_holds_for_review`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'}});
  if(!response.ok)return new Response('Database unavailable',{status:503});
  const rows=await response.json();
  // The normal endpoint serializes sends and preserves its idempotency key. Scheduled jobs never send from the browser.
  const mail=createEmailHandler({env,fetchImpl:fetch});
  for(const row of rows||[])await mail(new Request('http://internal/send',{method:'POST',headers:{'Content-Type':'application/json','x-reservation-scheduler-key':env.SCHEDULER_SECRET||''},body:JSON.stringify({outbox_id:row.id})}));
  return Response.json({ok:true,reviewed:(rows||[]).length});
}
