/** Request a server-side customer email for a saved inquiry. The browser sends no booking details. */
export async function sendInquiryReservationEmail(endpoint,inquiryId,{fetchImpl=globalThis.fetch,timeoutMs=12000}={}){
  if(!endpoint)return {status:'not_configured'};
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({inquiry_id:inquiryId}),signal:controller.signal});
    const body=await response.json().catch(()=>null);
    return response.ok&&body?.ok?{status:body.status||'accepted'}:{status:response.status===503&&body?.code==='not_configured'?'not_configured':response.status===429?'pending':'failed'};
  }catch{return {status:'pending'};}finally{clearTimeout(timer);}
}
