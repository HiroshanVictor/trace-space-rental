import test from 'node:test';
import assert from 'node:assert/strict';
import {guideTopic,guideQuestions,addGuideQuestion,guideMarkup} from '../src/traceGuide.js';
import {messages} from '../src/translations.js';

const state=()=>({messages:[],draft:'',lastTopic:null});
test('typed questions select specific answers rather than the generic booking or space keywords',()=>{
  for(const [text,topic] of [
    ['How do I book a space?','booking'],['IS THIS VENUE AVAILABLE?','availability'],['How much does a meeting cost?','pricing'],
    ['How can I pay for my booking?','payment'],['When is my reservation confirmed?','payment'],
    ['Can I cancel my payment and get a refund?','cancellation'],['Can I bring wine to the venue?','alcohol'],
    ['Do I need an account to book?','account'],['What spaces and facilities do you offer?','spaces'],['How?','booking'],
    ['Where is TRACE located?','location'],['Can I reschedule my reservation?','cancellation'],
    ['What is the weather?','unknown'],['hello','welcome'],['ගෙවීම් කරන්නේ කොහොමද?','payment'],['முன்பதிவு செய்வது எப்படி?','booking']
  ])assert.equal(guideTopic(text),topic,text);
  assert.equal(guideTopic('   '),null);
});
test('short follow-ups retain context, suggestions work in each language, and blank questions do nothing',()=>{
  const s=state();assert.equal(addGuideQuestion(' ',s),false);
  addGuideQuestion('Can I cancel?',s);addGuideQuestion('How?',s);
  assert.equal(s.messages.at(-1).topic,'cancellation');
  for(const q of guideQuestions){
    assert.ok(messages[q.question],q.question);
    addGuideQuestion(messages[q.question][0],s,q.id);
    assert.equal(s.messages.at(-1).topic,q.id);
  }
});
test('chat escapes user input, bounds conversation length and does not claim a real payment in dummy mode',()=>{
  const s=state();addGuideQuestion('<img src=x onerror="alert(1)">',s);
  let html=guideMarkup({open:true,state:s});
  assert.ok(html.includes('&lt;img'));assert.doesNotMatch(html,/<img src=x/);
  for(let i=0;i<25;i++)addGuideQuestion('How do I pay?',s);
  assert.equal(s.messages.length,30);
  html=guideMarkup({open:true,dummy:true,state:s});
  assert.match(html,/no real money is collected/);assert.match(html,/50% advance/);
  assert.doesNotMatch(guideMarkup({open:true,dummy:false,state:s}),/no real money is collected/);
  assert.match(guideMarkup({open:false,state:s}),/id="trace-guide-panel"[^>]*hidden/);
});
