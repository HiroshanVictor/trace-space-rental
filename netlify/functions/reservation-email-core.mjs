const clean=value=>String(value??'').replace(/[\r\n\t]+/g,' ').trim();
const escape=value=>clean(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const locale={en:'en-LK',si:'si-LK',ta:'ta-LK'};
const words={
  en:{received:'We received your space reservation request.',advance:'Advance payment required',confirmed:'Reservation confirmed',elapsed:'Payment deadline reached',cancelled:'Reservation cancelled',completed:'Thank you for choosing TRACE',refund:'Refund recorded',reference:'Reference',space:'Space',start:'Start',end:'End',deadline:'Payment deadline',amount:'Estimated total',paid:'Amount received',payment:'Payment reference',reply:'Reply to this email or contact the TRACE front desk if you need help.'},
  si:{received:'ඔබගේ ඉඩ වෙන්කිරීමේ ඉල්ලීම අපට ලැබුණි.',advance:'අත්තිකාරම් ගෙවීම අවශ්‍යයි',confirmed:'වෙන්කිරීම තහවුරු කරන ලදී',elapsed:'ගෙවීම් කාලසීමාව අවසන් වී ඇත',cancelled:'වෙන්කිරීම අවලංගු කරන ලදී',completed:'TRACE තෝරාගැනීම ගැන ස්තුතියි',refund:'ආපසු ගෙවීම සටහන් කරන ලදී',reference:'යොමුව',space:'ස්ථානය',start:'ආරම්භය',end:'අවසන්ය',deadline:'ගෙවීම් අවසන් කාලය',amount:'ඇස්තමේන්තු මුදල',paid:'ලැබුණු මුදල',payment:'ගෙවීම් යොමුව',reply:'උදව් අවශ්‍ය නම් මෙම විද්‍යුත් තැපෑලට පිළිතුරු දෙන්න හෝ TRACE ඉදිරිපස කාර්යාලය අමතන්න.'},
  ta:{received:'உங்கள் இட முன்பதிவு கோரிக்கையைப் பெற்றுள்ளோம்.',advance:'முன்பணம் தேவை',confirmed:'முன்பதிவு உறுதிப்படுத்தப்பட்டது',elapsed:'பணம் செலுத்தும் காலக்கெடு முடிந்தது',cancelled:'முன்பதிவு ரத்து செய்யப்பட்டது',completed:'TRACE-ஐத் தேர்ந்தெடுத்ததற்கு நன்றி',refund:'பணத்திரும்பல் பதிவு செய்யப்பட்டது',reference:'குறிப்பு',space:'இடம்',start:'தொடக்கம்',end:'முடிவு',deadline:'பணம் செலுத்தும் காலக்கெடு',amount:'மதிப்பிடப்பட்ட தொகை',paid:'பெறப்பட்ட தொகை',payment:'பணம் செலுத்தல் குறிப்பு',reply:'உதவி தேவைப்பட்டால் இந்த மின்னஞ்சலுக்கு பதிலளிக்கவும் அல்லது TRACE முன்பகுதி அலுவலகத்தை தொடர்புகொள்ளவும்.'}
};
const eventHeading=(event,copy)=>({inquiry_received:copy.received,advance_payment_requested:copy.advance,reservation_confirmed:copy.confirmed,payment_deadline_elapsed:copy.elapsed,reservation_cancelled:copy.cancelled,booking_completed:copy.completed,refund_recorded:copy.refund}[event]||copy.received);
export const dateTime=(value,language='en')=>value?new Intl.DateTimeFormat(locale[language]||locale.en,{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Colombo'}).format(new Date(value)):'—';
export function buildReservationEmail({event,conversation,inquiry,booking,space,paymentInstructions=''}){
  const language=conversation.preferred_language||inquiry?.reservation_language||booking?.preferred_language||'en';
  const copy=words[language]||words.en;
  const heading=eventHeading(event,copy);
  const rows=[
    [copy.reference,conversation.reference],
    [copy.space,space?.name],
    [copy.start,dateTime(booking?.start_at||inquiry?.start_at,language)],
    [copy.end,dateTime(booking?.end_at||inquiry?.end_at,language)]
  ];
  if(booking){rows.push([copy.amount,`LKR ${Number(booking.amount||0).toFixed(2)}`],[copy.paid,`LKR ${Number(booking.amount_paid||0).toFixed(2)}`]);}
  if(event==='advance_payment_requested'&&booking?.payment_deadline_at)rows.push([copy.deadline,dateTime(booking.payment_deadline_at,language)]);
  if(['reservation_confirmed','refund_recorded'].includes(event)&&booking?.payment_reference)rows.push([copy.payment,booking.payment_reference]);
  const detail=event==='inquiry_received'
    ? 'Your request has been recorded. TRACE will review the space and time before confirming a reservation.'
    : event==='advance_payment_requested'
      ? `Your selected slot is awaiting the recorded advance payment. ${paymentInstructions||'TRACE will provide payment instructions.'}`
      : event==='payment_deadline_elapsed'
        ? 'The payment deadline has passed. TRACE will review the reservation with you before any release or cancellation is confirmed.'
        : event==='reservation_cancelled'
          ? 'This reservation has been cancelled. Any refund decision is handled by TRACE; no automatic refund or fee is applied by this email.'
          : event==='refund_recorded'
            ? `TRACE has recorded a refund of LKR ${Number(booking?.refund_amount||0).toFixed(2)}.`
            : event==='booking_completed' ? 'We hope your event went well. Thank you for using TRACE Expert City.'
              : 'TRACE has recorded your advance and confirmed this reservation.';
  const text=[heading,'',detail,'',...rows.map(([label,value])=>`${clean(label)}: ${clean(value)}`),'',copy.reply,'Times are shown in Asia/Colombo.'].join('\n');
  const table=rows.map(([label,value])=>`<tr><th align="left" style="padding:6px 12px 6px 0">${escape(label)}</th><td style="padding:6px 0">${escape(value)}</td></tr>`).join('');
  const html=`<!doctype html><html><body style="font-family:Arial,sans-serif;color:#10233d;line-height:1.5"><h2>${escape(heading)}</h2><p>${escape(detail)}</p><table>${table}</table><p>${escape(copy.reply)}</p><p style="color:#52657d;font-size:12px">Times are shown in Asia/Colombo.</p></body></html>`;
  return {subject:conversation.subject,text,html};
}
export function threadHeaders(conversation){
  const parent=clean(conversation.last_message_id);
  if(!parent)return {parent:'',references:[],headers:{}};
  const refs=[clean(conversation.root_message_id),parent].filter((x,i,a)=>x&&a.indexOf(x)===i);
  return {parent,references:refs,headers:{'In-Reply-To':parent,References:refs.join(' ')}};
}
export const safeError=error=>clean(error?.message||error||'email_provider_unavailable').slice(0,240);
