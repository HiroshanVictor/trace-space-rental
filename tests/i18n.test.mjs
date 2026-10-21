import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {LANGUAGE_KEY,initLanguage,setLanguage,getLanguage,locale,t,labelFor,translateError} from '../src/i18n.js';
import {messages} from '../src/translations.js';
import {makeSeed} from '../src/data.js';
import {spaceText,companyAbout} from '../src/spaceContent.js';

const memoryStorage = () => {
  const data = new Map();
  return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
};
const useLanguage = code => setLanguage(code,{persist:false});

test('English is the default regardless of browser language, and invalid saved choices fall back to English',()=>{
  const storage = memoryStorage();
  assert.equal(initLanguage({storage}),'en');
  assert.equal(t('Our Spaces'),'Our Spaces');
  storage.setItem(LANGUAGE_KEY,'fr');
  assert.equal(initLanguage({storage}),'en');
});

test('language choice persists and updates document language, title and description',()=>{
  const storage=memoryStorage(),description={content:''};
  const doc={documentElement:{},querySelector:()=>description};
  setLanguage('si',{storage,document:doc});
  assert.equal(storage.getItem(LANGUAGE_KEY),'si');
  assert.equal(doc.documentElement.lang,'si');
  assert.equal(doc.documentElement.dir,'ltr');
  assert.match(doc.title,/ස්ථාන/);
  assert.match(description.content,/ස්ථාන/);
  useLanguage('en');
  initLanguage({storage,document:doc});
  assert.equal(getLanguage(),'si');
  assert.equal(locale(),'si-LK');
  assert.equal(t('Our Spaces'),'අපගේ ස්ථාන');
  setLanguage('ta',{storage,document:doc});
  assert.equal(locale(),'ta-LK');
  assert.equal(doc.documentElement.lang,'ta');
  assert.match(doc.title,/இடங்கள்/);
});

test('disabled storage never prevents language switching',()=>{
  const storage={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};
  assert.doesNotThrow(()=>initLanguage({storage}));
  assert.equal(getLanguage(),'en');
  assert.doesNotThrow(()=>setLanguage('ta',{storage}));
  assert.equal(t('Staff'),'பணியாளர்கள்');
});

test('dynamic labels translate without changing booking codes or substituting parameter contents',()=>{
  useLanguage('si');
  assert.equal(labelFor('confirmed'),'තහවුරු කළ');
  assert.equal(t('{count} desks',{count:14}),'මේස 14');
  assert.equal(t('Reservation {reference}',{reference:'TEC-{count}'}),'වෙන්කිරීම TEC-{count}');
  assert.equal(translateError('Time clash with TEC-0001.'),'TEC-0001 සමඟ වේලා ගැටුමක් ඇත.');
  assert.equal(translateError('Time clash with TEC-0001'),'TEC-0001 සමඟ වේලා ගැටුමක් ඇත.');
  assert.equal(translateError('Unavailable: Private reason.'),'ලබාගත නොහැක: Private reason.');
  useLanguage('ta');
  assert.equal(translateError('Only 2 desk(s) remain in that period.'),'அந்தக் காலப்பகுதியில் 2 மேசைகள் மட்டுமே மீதமுள்ளன.');
  assert.equal(translateError('Only 2 desk(s) remain in the selected period'),'அந்தக் காலப்பகுதியில் 2 மேசைகள் மட்டுமே மீதமுள்ளன.');
  assert.equal(labelFor('bank_transfer'),'வங்கிப் பரிமாற்றம்');
  assert.equal(t('Unrecognized customer text'),'Unrecognized customer text');
});

test('sample content translates only for the original records and never mutates stored data',()=>{
  const data=makeSeed(),original=structuredClone(data);
  useLanguage('si');
  assert.equal(spaceText(data.spaces[0]),'ක්‍රියේටර් ස්පේස්');
  assert.notEqual(spaceText(data.spaces[0],'description'),data.spaces[0].description);
  for(const space of data.spaces){
    assert.notEqual(spaceText(space),space.name);
    assert.notEqual(spaceText(space,'description'),space.description);
    assert.notEqual(spaceText(space,'amenities'),space.amenities);
    assert.notEqual(spaceText(space,'conditions'),space.conditions);
  }
  assert.notEqual(companyAbout(data.settings),data.settings.about);
  assert.equal(spaceText({...data.spaces[0],name:'Custom venue'}),'Custom venue');
  assert.equal(spaceText({...data.spaces[0],id:'custom-id'}),'ක්‍රියේටර් ස්පේස්');
  useLanguage('ta');
  for(const space of data.spaces)assert.notEqual(spaceText(space),space.name);
  assert.equal(companyAbout({about:'Custom business copy'}),'Custom business copy');
  assert.deepEqual(data,original);
});

test('both translations cover every explicit UI message and preserve interpolation parameters',async()=>{
  for(const file of ['app.js','i18n.js','languageUI.js']){
    const source=await readFile(new URL('../src/'+file,import.meta.url),'utf8');
    const keys=[...source.matchAll(/\bt\(("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g)].map(match=>Function('return '+match[1])());
    for(const key of keys)assert.ok(Object.hasOwn(messages,key),`${file}: untranslated message ${key}`);
  }
  const parameters=text=>[...text.matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort();
  for(const [key,pair]of Object.entries(messages)){
    assert.equal(pair.length,2,key);
    assert.match(pair[0],/[\u0D80-\u0DFF]/,`Sinhala: ${key}`);
    assert.match(pair[1],/[\u0B80-\u0BFF]/,`Tamil: ${key}`);
    for(const text of pair)assert.deepEqual(parameters(text),parameters(key),key);
  }
});
