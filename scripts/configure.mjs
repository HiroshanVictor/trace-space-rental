import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';

export function buildConfig(env,existing={}) {
  const url=env.SUPABASE_URL?.trim()||existing.supabaseUrl||'';
  const key=(env.SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY)?.trim()||existing.supabaseAnonKey||'';
  if(Boolean(url)!==Boolean(key))throw Error('Set both SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY).');
  if(url){
    let parsed;
    try{parsed=new URL(url)}catch{throw Error('SUPABASE_URL must be a valid project URL.');}
    if(parsed.protocol!=='https:' && !(parsed.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)))throw Error('SUPABASE_URL must use HTTPS, except for a local test database.');
    if(parsed.username||parsed.password||parsed.search||parsed.hash)throw Error('SUPABASE_URL must not contain credentials or query parameters.');
    if(!key.startsWith('sb_publishable_')){
      let role;
      try{role=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role}catch{}
      if(role!=='anon')throw Error('Use a public publishable/anon key in the browser configuration. Server keys are not allowed.');
    }
  }
  const emailReady=url && ['SUPABASE_SERVICE_ROLE_KEY','RESEND_API_KEY','INQUIRY_TO_EMAIL','RESEND_FROM_EMAIL'].every(name=>Boolean(env[name]?.trim()));
  const endpoint=env.INQUIRY_NOTIFY_ENDPOINT!==undefined?env.INQUIRY_NOTIFY_ENDPOINT.trim():existing.notifyInquiryEndpoint||(emailReady?'/.netlify/functions/notify-inquiry':'');
  if(endpoint && (!endpoint.startsWith('/')||endpoint.startsWith('//')))throw Error('INQUIRY_NOTIFY_ENDPOINT must be a path on this website.');
  // The existing staff inbox is a safe Reply-To fallback. A dedicated front-desk
  // Reply-To address can still be supplied when one is available.
  const conversationReady=emailReady;
  const reservationEmailEndpoint=env.RESERVATION_EMAIL_ENDPOINT!==undefined?env.RESERVATION_EMAIL_ENDPOINT.trim():existing.reservationEmailEndpoint||(conversationReady?'/.netlify/functions/send-reservation-email':'');
  if(reservationEmailEndpoint && (!reservationEmailEndpoint.startsWith('/')||reservationEmailEndpoint.startsWith('//')))throw Error('RESERVATION_EMAIL_ENDPOINT must be a path on this website.');
  return {supabaseUrl:url.replace(/\/$/,''),supabaseAnonKey:key,notifyInquiryEndpoint:endpoint,reservationEmailEndpoint};
}

export async function configure({env=process.env,configPath=resolve('config.js')} = {}) {
  const sandbox={window:{}};
  vm.runInNewContext(await readFile(configPath,'utf8'),sandbox,{timeout:1000});
  const result=buildConfig(env,sandbox.window.SPACE_RENTAL_CONFIG);
  await writeFile(configPath,'// Public browser configuration. Server secrets are never written here.\nwindow.SPACE_RENTAL_CONFIG = '+JSON.stringify(result,null,2)+';\n');
  console.log(`Workspace: ${result.supabaseUrl?'shared Supabase':'browser-local demo'}. Inquiry email endpoint: ${result.notifyInquiryEndpoint?'configured':'not configured'}.`);
  return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{await configure()}catch(error){console.error(error.message);process.exitCode=1;}
}
