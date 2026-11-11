import {createHash} from 'node:crypto';
import nodemailer from 'nodemailer';

const address=value=>typeof value==='string'&&/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value);
const value=(env,key)=>String(env[key]||'').trim();
// Only fixed operational codes may appear in logs or stored delivery failures.
export function emailFailureCode(error){
  const codes=['smtp_auth_failed','smtp_timeout','smtp_send_failed','smtp_recipient_rejected','smtp_invalid_response','provider_rejected','database_unavailable','conversation_unavailable','invalid_saved_recipient','email_not_configured','checkout_not_configured','checkout_unavailable'];
  return codes.includes(error?.message)?error.message:'email_provider_unavailable';
}

export function emailConfigurationIssues(env){
  const provider=value(env,'EMAIL_PROVIDER')||'resend';
  if(!['resend','gmail_smtp'].includes(provider))return ['EMAIL_PROVIDER must be resend or gmail_smtp'];
  const keys=provider==='gmail_smtp'?['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASS','EMAIL_FROM_EMAIL']:['RESEND_API_KEY','RESEND_FROM_EMAIL'];
  const issues=keys.filter(key=>!value(env,key));
  if(provider==='gmail_smtp'){
    if(value(env,'SMTP_HOST')&&value(env,'SMTP_HOST')!=='smtp.gmail.com')issues.push('SMTP_HOST must be smtp.gmail.com');
    if(value(env,'SMTP_PORT')&&value(env,'SMTP_PORT')!=='465')issues.push('SMTP_PORT must be 465');
    if(value(env,'SMTP_USER')&&!address(value(env,'SMTP_USER')))issues.push('SMTP_USER must be an email address');
    if(value(env,'EMAIL_FROM_EMAIL')&&value(env,'EMAIL_FROM_EMAIL').toLowerCase()!==value(env,'SMTP_USER').toLowerCase())issues.push('EMAIL_FROM_EMAIL must match SMTP_USER');
    if(value(env,'EMAIL_REPLY_TO')&&!address(value(env,'EMAIL_REPLY_TO')))issues.push('EMAIL_REPLY_TO must be an email address');
  }
  return issues;
}

// Shared by server functions and the build-time readiness check. Never serialize
// this object into browser configuration or log transport options/errors.
export function emailSettings(env){
  const provider=value(env,'EMAIL_PROVIDER')||'resend';
  if(provider==='gmail_smtp'){
    const user=value(env,'SMTP_USER'),from=value(env,'EMAIL_FROM_EMAIL');
    const replyTo=value(env,'EMAIL_REPLY_TO')||user;
    if(value(env,'SMTP_HOST')!=='smtp.gmail.com'||value(env,'SMTP_PORT')!=='465'||
      !address(user)||!address(from)||from.toLowerCase()!==user.toLowerCase()||
      !value(env,'SMTP_PASS')||!address(replyTo))return null;
    return {provider,from,name:value(env,'EMAIL_FROM_NAME').replace(/[\r\n]/g,'')||'TRACE Expert City Reservations',replyTo};
  }
  if(provider!=='resend'||!value(env,'RESEND_API_KEY')||!value(env,'RESEND_FROM_EMAIL'))return null;
  return {provider,from:value(env,'RESEND_FROM_EMAIL'),name:'TRACE Expert City Reservations',replyTo:value(env,'RESEND_REPLY_TO_EMAIL')||value(env,'INQUIRY_TO_EMAIL')};
}

// Reuse a Message-ID on retries. SMTP servers are not required to deduplicate it:
// a crash after acceptance but before the database commit can still send twice.
export function smtpMessageId(key,from){
  return `<trace-${createHash('sha256').update(key).digest('hex')}@${from.split('@')[1].toLowerCase()}>`;
}

export async function sendProviderEmail({env,fetchImpl=globalThis.fetch,createTransportImpl,message,idempotencyKey,lookupMessageId=false}){
  const settings=emailSettings(env);
  if(!settings)throw Error('email_not_configured');
  if(!address(message.to))throw Error('invalid_saved_recipient');
  if(settings.provider==='gmail_smtp'){
    let transport;
    try{
      const createTransport=createTransportImpl||nodemailer.createTransport;
      transport=createTransport({host:'smtp.gmail.com',port:465,secure:true,
        auth:{user:value(env,'SMTP_USER'),pass:value(env,'SMTP_PASS')},
        tls:{minVersion:'TLSv1.2',rejectUnauthorized:true},
        connectionTimeout:8000,greetingTimeout:8000,socketTimeout:10000,
        logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true});
      const messageId=smtpMessageId(idempotencyKey,settings.from);
      const info=await transport.sendMail({from:{name:settings.name,address:settings.from},to:[message.to],replyTo:settings.replyTo,
        subject:message.subject,text:message.text,html:message.html,messageId,
        inReplyTo:message.threading?.parent||undefined,references:message.threading?.references?.length?message.threading.references:undefined});
      if(!info?.accepted?.some(item=>String(item.address||item).toLowerCase()===message.to.toLowerCase())||info.rejected?.length)throw Error('smtp_recipient_rejected');
      if(info.messageId!==messageId)throw Error('smtp_invalid_response');
      return {providerId:`gmail_smtp:${createHash('sha256').update(idempotencyKey).digest('hex')}`,rfcMessageId:info.messageId};
    }catch(error){
      // Nodemailer errors can contain auth data, server responses or recipients.
      // Persist and return only fixed codes; never log the original exception.
      const code=error?.code==='EAUTH'?'smtp_auth_failed':error?.code==='ETIMEDOUT'?'smtp_timeout':
        ['smtp_recipient_rejected','smtp_invalid_response'].includes(error?.message)?error.message:'smtp_send_failed';
      throw Error(code);
    }finally{try{transport?.close?.();}catch{/* Closing must not obscure the acceptance result. */}}
  }
  const response=await fetchImpl('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':idempotencyKey},
    body:JSON.stringify({from:message.from||`TRACE Expert City Reservations <${settings.from}>`,reply_to:settings.replyTo||undefined,to:[message.to],subject:message.subject,text:message.text,html:message.html,headers:message.threading?.headers}),signal:AbortSignal.timeout(10000)});
  const accepted=await response.json().catch(()=>null);
  if(!response.ok||!accepted?.id)throw Error('provider_rejected');
  let rfcMessageId='';
  if(lookupMessageId){
    try{
      const lookup=await fetchImpl(`https://api.resend.com/emails/${accepted.id}`,{headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`},signal:AbortSignal.timeout(8000)});
      const details=await lookup.json().catch(()=>null);
      if(lookup.ok&&typeof details?.message_id==='string')rfcMessageId=details.message_id;
    }catch{/* Resend's webhook can supply its RFC Message-ID later. */}
  }
  return {providerId:accepted.id,rfcMessageId};
}
