import {createHandler as createEmailHandler} from './send-reservation-email.mjs';
export default async function handler(req){
  const env=process.env;
  const {SUPABASE_URL:url,SUPABASE_SERVICE_ROLE_KEY:key}=env;if(!url||!key||!env.SCHEDULER_SECRET)return new Response('Not configured',{status:503});
  const before=encodeURIComponent(new Date().toISOString());
  const response=await fetch(`${url.replace(/\/$/,'')}/rest/v1/reservation_email_outbox?status=in.(pending,failed)&available_at=lte.${before}&select=id&order=created_at.asc&limit=25`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
  if(!response.ok)return new Response('Database unavailable',{status:503});
  const rows=await response.json();const mail=createEmailHandler({env,fetchImpl:fetch});
  for(const row of rows)await mail(new Request('http://internal/send',{method:'POST',headers:{'Content-Type':'application/json','x-reservation-scheduler-key':env.SCHEDULER_SECRET},body:JSON.stringify({outbox_id:row.id})}));
  return Response.json({ok:true,attempted:rows.length});
}
