import {createHmac,timingSafeEqual} from 'node:crypto';

const uuid=value=>typeof value==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
export function paymentSettings(env){
  if(env.PAYMENT_GATEWAY!=='dummy'||String(env.PAYMENT_LINK_SECRET||'').length<32)return null;
  try{
    const site=new URL(env.PAYMENT_SITE_URL||env.URL);
    if(site.username||site.password||site.search||site.hash)return null;
    if(site.protocol!=='https:'&&!(site.protocol==='http:'&&['localhost','127.0.0.1'].includes(site.hostname)))return null;
    return {secret:env.PAYMENT_LINK_SECRET,origin:site.origin};
  }catch{return null}
}
const signature=(payload,secret)=>createHmac('sha256',secret).update(payload).digest();
export function paymentToken(request,secret){
  const payload=Buffer.from(JSON.stringify({r:request.id,b:request.booking_id,e:Math.floor(new Date(request.expires_at).getTime()/1000)})).toString('base64url');
  return payload+'.'+signature(payload,secret).toString('base64url');
}
export function verifyPaymentToken(token,secret,now=Date.now()){
  try{
    if(typeof token!=='string'||token.length>1024||!/^[-\w]+\.[-\w]+$/.test(token))return null;
    const [payload,encoded]=token.split('.'),actual=Buffer.from(encoded,'base64url'),expected=signature(payload,secret);
    if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
    const value=JSON.parse(Buffer.from(payload,'base64url').toString());
    if(!uuid(value.r)||!uuid(value.b)||!Number.isSafeInteger(value.e)||value.e*1000<=now)return null;
    return {requestId:value.r,bookingId:value.b};
  }catch{return null}
}
export function paymentLink(request,settings){
  return `${settings.origin}/#payment/${paymentToken(request,settings.secret)}`;
}
