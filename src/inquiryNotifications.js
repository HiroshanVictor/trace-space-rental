/** A notification failure must never make a saved inquiry look unsaved. */
export async function notifyInquiry(endpoint, inquiryId, {fetchImpl=globalThis.fetch,timeoutMs=12000} = {}) {
  if (!endpoint) return {status:'not_configured'};
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const response=await fetchImpl(endpoint,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({inquiry_id:inquiryId}),signal:controller.signal
    });
    const result=await response.json().catch(()=>null);
    if (response.ok && result?.ok === true && result.status === 'sent') return {status:'sent'};
    if (response.status === 503 && result?.code === 'not_configured') return {status:'not_configured'};
    if (response.status === 429) return {status:'pending'};
    return {status:'failed'};
  } catch {
    // The server may have accepted the email even when the response was lost.
    return {status:'pending'};
  } finally { clearTimeout(timeout); }
}
