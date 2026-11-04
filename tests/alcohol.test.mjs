import test from 'node:test';
import assert from 'node:assert/strict';
import {alcoholValues,validateAlcohol,readAlcoholForm,ALCOHOL_ACK_REQUIRED} from '../src/alcohol.js';
import {alcoholFields} from '../src/alcoholUI.js';
import {setLanguage,t,translateError} from '../src/i18n.js';

test('new declarations default to No without pre-accepting acknowledgement',()=>{
  assert.deepEqual(alcoholValues(),{alcohol_planned:false,alcohol_terms_accepted:false});
  const html=alcoholFields();
  assert.match(html,/value="no" checked/);
  assert.doesNotMatch(html,/data-alcohol-acknowledgement checked/);
  assert.match(html,/data-alcohol-acknowledgement-row hidden/);
});

test('Yes requires acknowledgement; No does not',()=>{
  for(const planned of [true,'yes','true']){
    assert.throws(()=>validateAlcohol({alcohol_planned:planned}),{message:ALCOHOL_ACK_REQUIRED});
    assert.doesNotThrow(()=>validateAlcohol({alcohol_planned:planned,alcohol_terms_accepted:true}));
  }
  for(const planned of [false,'no','false',undefined])assert.deepEqual(validateAlcohol({alcohol_planned:planned}),{alcohol_planned:false,alcohol_terms_accepted:false});
});

test('form values become booleans and never create an approval field',()=>{
  const form=(choice,checked)=>({elements:{namedItem:name=>name==='alcohol_planned'?{value:choice}:{checked}}});
  assert.deepEqual(readAlcoholForm(form('yes',true)),{alcohol_planned:true,alcohol_terms_accepted:true});
  assert.deepEqual(readAlcoholForm(form('no',false)),{alcohol_planned:false,alcohol_terms_accepted:false});
  assert.throws(()=>readAlcoholForm(form('yes',false)),{message:ALCOHOL_ACK_REQUIRED});
  assert.doesNotMatch(JSON.stringify(readAlcoholForm(form('yes',true))),/approved/);
});

test('editing and inquiry conversion preserve saved declarations and acknowledgements independently',()=>{
  for(const record of [{alcohol_planned:true,alcohol_terms_accepted:true},{alcohol_planned:false,alcohol_terms_accepted:false},{alcohol_planned:false,alcohol_terms_accepted:true}]){
    const saved=structuredClone(record),converted={customer_name:'Test',...alcoholValues(saved)};
    assert.deepEqual(alcoholValues(converted),record);
    const html=alcoholFields(converted,'reservation');
    assert.match(html,new RegExp(`value="${record.alcohol_planned?'yes':'no'}" checked`));
    assert.equal(/data-alcohol-acknowledgement checked/.test(html),record.alcohol_terms_accepted);
    assert.deepEqual(saved,record);
  }
});

test('alcohol labels and browser/database validation use consistent translations',()=>{
  const keys=['Will alcohol be brought or consumed at this event?','I understand that alcohol requires management approval and may not be sold.','Declaring alcohol consumption does not mean management approval has been granted.',ALCOHOL_ACK_REQUIRED];
  for(const code of ['en','si','ta']){
    setLanguage(code,{persist:false});
    for(const key of keys){
      assert.equal(translateError(key),t(key));
      if(code==='si')assert.match(t(key),/[\u0D80-\u0DFF]/);
      if(code==='ta')assert.match(t(key),/[\u0B80-\u0BFF]/);
    }
    assert.ok(alcoholFields().includes(t(keys[0])));
  }
  setLanguage('en',{persist:false});
});
