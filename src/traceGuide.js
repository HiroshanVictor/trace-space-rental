import {safeHtml as h} from './engine.js';
import {t} from './i18n.js';

export const guideState={messages:[],draft:'',lastTopic:null};
export const guideQuestions=[
  {id:'booking',question:'How do I book a space?'},
  {id:'availability',question:'How do I check availability?'},
  {id:'pricing',question:'Where can I see prices?'},
  {id:'payment',question:'How do payments work?'},
  {id:'cancellation',question:'Can I cancel a reservation?'},
  {id:'alcohol',question:'Can I bring alcohol?'}
];
const normalize=text=>String(text||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
const contains=(text,phrase)=>/[a-z]/.test(phrase)?` ${text} `.includes(` ${phrase} `):text.includes(phrase);
const intents=[
  ['cancellation',['cancel','cancellation','cancellations','refund','refunds','අවලංගු','ආපසු ගෙව','ரத்து','பணத்திரும்பல்']],
  ['alcohol',['alcohol','beer','wine','liquor','drink','drinks','මත්පැන්','මත්පැ','மது','மதுபானம்']],
  ['payment',['pay','payment','payments','paid','advance','deposit','half','confirm','confirmed','confirmation','checkout','ගෙව','තහවුරු','கட்டணம்','செலுத்த','உறுதிப்படுத்த']],
  ['pricing',['price','prices','pricing','cost','costs','rate','rates','how much','fee','fees','මිල','ගාස්තු','விலை','செலவு']],
  ['availability',['available','availability','calendar','schedule','free','date','dates','time','times','ලබාගත','කාලසටහ','දිනය','கிடைக்கும்','நாட்காட்டி','தேதி']],
  ['account',['account','accounts','login','log in','sign in','register','registration','ගිණුම','පිවිස','கணக்கு','உள்நுழை']],
  ['booking',['book','booking','bookings','reserve','reservation','reservations','inquiry','request','වෙන්කර','වෙන් කර','වෙන්කිරී','විමසී','முன்பதிவு','விசாரணை']],
  ['spaces',['space','spaces','venue','venues','desk','desks','capacity','people','meeting','auditorium','ස්ථාන','ධාරිතාව','இடம்','இடங்கள்','கொள்ளளவு']]
];
export function guideTopic(question,lastTopic=null){
  const text=normalize(question);
  if(!text)return null;
  if(['how','how do i do that','how do i','tell me more','more','where','yes','කොහොමද','எப்படி'].includes(text))return lastTopic||'booking';
  // Specific topics win over generic words such as "reservation" or "space".
  for(const [topic,phrases] of intents)if(phrases.some(phrase=>contains(text,phrase)))return topic;
  if(['hi','hello','hey','thanks','thank you','ආයුබෝවන්','வணக்கம்'].includes(text))return 'welcome';
  return 'unknown';
}
export function addGuideQuestion(question,state=guideState,selectedTopic=null){
  const text=String(question||'').trim().slice(0,500);if(!text)return false;
  const topic=guideQuestions.some(q=>q.id===selectedTopic)?selectedTopic:guideTopic(text,state.lastTopic);
  state.messages.push({role:'user',text},{role:'guide',topic});
  state.messages=state.messages.slice(-30);state.draft='';
  if(!['unknown','welcome'].includes(topic))state.lastTopic=topic;
  return true;
}
function answer(topic,dummy){
  switch(topic){
    case 'booking':return {text:t('Open Our Spaces, choose a venue and click Book Now. Fill in your contact details, event and preferred dates, then review the terms and send your inquiry. TRACE reviews your request before approving a reservation.'),route:'catalog',label:t('Browse spaces')};
    case 'availability':return {text:t('Open the Availability calendar and choose your date and space to see booked times. You can also check your selected time in the booking form. The schedule can change; an inquiry alone does not reserve a space.'),route:'availability',label:t('Availability calendar')};
    case 'pricing':return {text:t('Browse Our Spaces to see each venue’s rates. The total depends on the space, dates, duration and number of desks where applicable. TRACE will confirm your quotation and payment details.'),route:'catalog',label:t('Browse spaces')};
    case 'payment':return {text:dummy?t('After staff approve your reservation, an email provides a link for the 50% advance. The current checkout is a dummy gateway: no real money is collected. A successful simulated payment confirms the reservation; the remaining balance is shown on checkout.'):t('TRACE will confirm the required advance and payment instructions after reviewing your inquiry. Your inquiry is a request; it is not a confirmed reservation. Contact TRACE if you need payment or confirmation help.'),route:'request',label:t('Request a space')};
    case 'cancellation':return {text:t('Contact TRACE by phone and official email to request cancellation. The team reviews the reservation, timing, refund and any applicable fee. This guide cannot cancel a booking or promise a refund.')};
    case 'alcohol':return {text:t('Declare alcohol in the customer booking form and accept the alcohol conditions when selecting Yes. Management approval is required, and alcohol may not be sold. Declaring alcohol does not grant approval.'),route:'request',label:t('Request a space')};
    case 'account':return {text:t('Customers can send a booking inquiry without creating an account. The Staff sign-in is for authorised TRACE staff. Use the customer email you can access so you can receive booking updates.'),route:'request',label:t('Request a space')};
    case 'spaces':return {text:t('Our Spaces lists meeting and training venues, auditoriums and co-working desks. Open a space to check its capacity, facilities, rates and conditions before sending an inquiry.'),route:'catalog',label:t('Browse spaces')};
    case 'welcome':return {text:t('Hello! Ask me about booking a space, availability, prices, payments, cancellations or alcohol conditions. You can type a question or choose one below.')};
    default:return {text:t('I can help with booking, availability, prices, payments, cancellations, alcohol conditions and customer accounts. Try “How do I book a space?” or choose a question below. For help with a specific reservation, contact TRACE.')};
  }
}
export function guideMarkup({open=false,dummy=false,state=guideState}={}){
  const welcome=answer('welcome',dummy);
  const messages=[{role:'guide',topic:'welcome'},...state.messages].map(message=>{
    if(message.role==='user')return `<div class="guide-message guide-user">${h(message.text)}</div>`;
    const response=message.topic==='welcome'?welcome:answer(message.topic,dummy);
    return `<div class="guide-message guide-answer"><p>${h(response.text)}</p>${response.route?`<button type="button" data-go="${response.route}">${h(response.label)} <span aria-hidden="true">→</span></button>`:''}</div>`;
  }).join('');
  return `<aside class="trace-guide ${open?'open':''}" aria-label="${h(t('TRACE Guide'))}">
    <section class="trace-guide-panel" id="trace-guide-panel" aria-labelledby="trace-guide-title" ${open?'':'hidden'}>
      <div class="trace-guide-head"><div><strong id="trace-guide-title">${t('TRACE Guide')}</strong><span>${t('Quick answers')}</span></div><button type="button" data-action="toggle-trace-guide" aria-label="${h(t('Close guide'))}">×</button></div>
      <div class="guide-messages" role="log" aria-live="polite" aria-label="${h(t('Conversation'))}">${messages}</div>
      <div class="guide-questions" role="group" aria-label="${h(t('Suggested questions'))}">${guideQuestions.map(q=>`<button type="button" data-action="guide-question" data-question="${q.id}">${h(t(q.question))}</button>`).join('')}</div>
      <form data-form="trace-guide" class="guide-compose"><label for="guide-question-input" class="guide-sr-only">${t('Your question')}</label><input id="guide-question-input" name="question" data-guide-input type="text" maxlength="500" autocomplete="off" placeholder="${h(t('Type your question…'))}" value="${h(state.draft)}"><button type="submit" aria-label="${h(t('Send question'))}">→</button></form>
      <small class="guide-note">${t('Answers cover common questions. For help with your reservation, contact TRACE.')}</small>
    </section>
    <button type="button" class="trace-guide-toggle" data-action="toggle-trace-guide" aria-expanded="${open}" aria-controls="trace-guide-panel" aria-label="${h(t(open?'Close guide':'Open guide'))}"><span>TRACE</span><b aria-hidden="true">✦</b></button>
  </aside>`;
}
