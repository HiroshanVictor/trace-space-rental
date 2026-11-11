import {safeHtml as h} from './engine.js';
import {t,locale} from './i18n.js';

export const checkoutState={token:'',payment:null,loading:false,error:'',emailStatus:''};
const amount=value=>'LKR '+Number(value||0).toLocaleString(locale(),{minimumFractionDigits:2,maximumFractionDigits:2});
const when=value=>new Intl.DateTimeFormat(locale(),{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Colombo'}).format(new Date(value));
const errors={invalid_or_expired_link:'This payment link is invalid or has expired. Contact TRACE for help.',
  payment_unavailable:'This reservation cannot be paid now. It may have expired or been cancelled. Contact TRACE.',
  checkout_not_configured:'Checkout is not configured yet. Please contact TRACE.',
  checkout_unavailable:'Checkout could not connect. Please try again. Your reservation has not been lost.'};
export async function requestCheckout(action,token,{fetchImpl=globalThis.fetch}={}){
  let response,body;
  try{
    response=await fetchImpl('/.netlify/functions/reservation-payment',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action,token}),signal:AbortSignal.timeout(20000)});
    body=await response.json();
  }catch{throw Error(errors.checkout_unavailable)}
  if(!response.ok||!body?.ok)throw Error(errors[body?.code]||errors.checkout_unavailable);
  if(action==='pay'&&!['confirmed','already_paid'].includes(body.status))throw Error(errors.checkout_unavailable);
  return body;
}
export function paymentCheckoutPage(state=checkoutState){
  const p=state.payment;
  const row=(label,value)=>'<div class="checkout-row"><span>'+h(t(label))+'</span><strong>'+h(value)+'</strong></div>';
  let body=state.loading?'<p role="status">'+t('Loading checkout…')+'</p>':'';
  if(state.error)body+='<p role="alert" class="checkout-error">'+h(t(state.error))+'</p><button type="button" class="btn" data-action="reload-checkout">'+t('Try again')+'</button>';
  else if(p&&!state.loading){
    const paid=p.status==='paid';
    body+='<div class="checkout-status '+(paid?'paid':'')+'">'+(paid?t('Reservation confirmed — test payment recorded'):t('Approved — awaiting your 50% advance'))+'</div>'+
      row('Reference',p.reference)+row('Space',p.space_name)+row('Start',when(p.start_at))+row('End',when(p.end_at))+
      row('Total price',amount(p.total))+row(paid?'Advance recorded (test)':'Advance to pay (50%)',amount(p.amount_requested))+
      row('Remaining balance',amount(p.balance_after_payment))+'<p class="note">'+t('Times are shown in Asia/Colombo.')+'</p>';
    if(!paid)body+=row('Payment deadline',when(p.expires_at))+'<form data-form="dummy-payment" class="checkout-form">'+
      '<label class="checkout-ack"><input type="checkbox" name="test_payment_ack" required><span>'+t('I understand this is a simulated payment and no real money will be charged.')+'</span></label>'+
      '<button class="btn fullwidth" type="submit">'+t('Simulate payment and confirm reservation')+'</button></form>';
    else body+='<p role="status">'+t('Your reservation is confirmed. The remaining balance is shown above.')+'</p>'+
      (state.emailStatus==='pending'?'<p class="note">'+t('Your confirmation email is queued for retry; the reservation remains confirmed.')+'</p>':'');
  }
  return '<div class="checkout-page"><header class="checkout-header"><a href="./?home#home"><img src="./public/assets/trace-logo.png" alt="TRACE"></a><span>TRACE Expert City</span></header>'+
    '<main class="checkout-card"><div class="eyebrow">'+t('CUSTOMER CHECKOUT')+'</div><h1>'+t('Confirm your reservation')+'</h1>'+
    '<div class="checkout-test">'+t('Dummy payment gateway — testing only. No real money is collected. Do not enter card or bank details.')+'</div>'+body+
    '<a class="checkout-home" href="./?home#home">'+t('Back to website')+'</a></main></div>';
}
