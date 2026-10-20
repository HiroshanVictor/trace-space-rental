/** OPTIONAL inquiry email — enabled only when RESEND_API_KEY, INQUIRY_TO_EMAIL,
 * RESEND_FROM_EMAIL are configured in Netlify environment variables and
 * config.js points notifyInquiryEndpoint to '/.netlify/functions/notify-inquiry'.
 * Public endpoints can be spammed; use Turnstile and rate limiting in production.
 * Never expose provider API keys to the browser. */
export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed',{status:405});
  const key=process.env.RESEND_API_KEY, recipient=process.env.INQUIRY_TO_EMAIL, sender=process.env.RESEND_FROM_EMAIL;
  if(!key||!recipient||!sender)return new Response('Email is not configured',{status:503});
  const claimedLength=Number(req.headers.get('content-length')||0);
  if(claimedLength>12000)return new Response('Request too large',{status:413});
  let data;
  try{const raw=await req.text();if(raw.length>12000)return new Response('Request too large',{status:413});data=JSON.parse(raw);}catch{return new Response('Invalid JSON',{status:400});}
  const pick=(x,max=300)=>String(x||'').replace(/[\r\n\t]/g,' ').slice(0,max);
  const name=pick(data.name,120),email=pick(data.email,180),phone=pick(data.phone,60);
  if(!name||!email.includes('@')||!phone||!data.space_id||!data.start_at||!data.end_at)return new Response('Missing fields',{status:400});
  const text=[
    'New space-rental inquiry (not a confirmed booking)',
    `Name: ${name}`,`Email: ${email}`,`Phone: ${phone}`,
    `Space ID: ${pick(data.space_id,90)}`,
    `Requested start: ${pick(data.start_at,80)}`,
    `Requested end: ${pick(data.end_at,80)}`,
    `Message: ${pick(data.message,1000)}`,
    'Review the inquiry in the Trace Expert City admin portal before booking.'
  ].join('\n');
  try{
    const sent=await fetch('https://api.resend.com/emails',{
      method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify({from:sender,to:[recipient],subject:`New space rental inquiry: ${name}`,text})
    });
    if(!sent.ok)return new Response('Email provider rejected request',{status:502});
    return Response.json({ok:true});
  }catch{return new Response('Email provider unreachable',{status:502});}
};
export const config={path:'/.netlify/functions/notify-inquiry'};
