import {messages} from './translations.js';

export const LANGUAGE_KEY = 'tec-space-rental-language';
export const languages = Object.freeze([
  {code:'en', name:'English', locale:'en-GB'},
  {code:'si', name:'සිංහල', locale:'si-LK'},
  {code:'ta', name:'தமிழ்', locale:'ta-LK'}
]);

let language = 'en';
export const getLanguage = () => language;
export const locale = () => languages.find(item => item.code === language).locale;

export function setLanguage(code, {persist = true, storage, document:doc = globalThis.document} = {}) {
  language = languages.some(item => item.code === code) ? code : 'en';
  if (persist) {
    try { (storage ?? globalThis.localStorage)?.setItem(LANGUAGE_KEY, language); } catch { /* Private browsing may disable storage. */ }
  }
  if (doc) {
    doc.documentElement.lang = language;
    doc.documentElement.dir = 'ltr';
    doc.title = t('Trace Expert City | Spaces & Reservations');
    const description = doc.querySelector('meta[name="description"]');
    if (description) description.content = t('Trace Expert City — explore inspiring spaces and manage bookings without clashes.');
  }
  return language;
}

export function initLanguage(options = {}) {
  let saved;
  try { saved = (options.storage ?? globalThis.localStorage)?.getItem(LANGUAGE_KEY); } catch { /* Keep English as the default. */ }
  return setLanguage(saved, {...options, persist:false});
}

/** Translate interface copy only. Named parameters keep dynamic values out of message keys. */
export function t(source, values = {}) {
  const pair = Object.hasOwn(messages, source) ? messages[source] : undefined;
  const translated = language === 'en' ? source : pair?.[language === 'si' ? 0 : 1] || source;
  return translated.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
}

const labels = {
  pending:'Pending', confirmed:'Confirmed', completed:'Completed', cancelled:'Cancelled',
  new:'New', contacted:'Contacted', converted:'Converted', closed:'Closed',
  unpaid:'Unpaid', partial:'Partially paid', paid:'Paid', refunded:'Refunded',
  active:'Active', archived:'Archived', blocked:'Blocked', available:'Available', 'partly booked':'Partly booked',
  hour:'hour', day:'day', week:'week', month:'30 days',
  cash:'Cash', bank_transfer:'Bank transfer', card:'Card / POS', other:'Other',
  bookings:'Reservations', spaces:'Spaces', customers:'Customers', inquiries:'Inquiries'
};
export const labelFor = code => t(labels[code] || code);

/** Translate application errors while retaining references and staff-entered reasons. */
export function translateError(message) {
  if (!message) return t('Something went wrong.');
  if (Object.hasOwn(messages, message)) return t(message);
  const patterns = [
    [/^Choose between 1 and (\d+) unit\(s\)\.$/, 'Choose between 1 and {count} unit(s).', 'count'],
    [/^Only (\d+) desk\(s\) remain in that period\.$/, 'Only {count} desk(s) remain in that period.', 'count'],
    [/^Time clash with (.+?)\.?$/, 'Time clash with {reference}.', 'reference'],
    [/^Unavailable: (.+)\.$/, 'Unavailable: {reason}.', 'reason'],
    [/^Only (\d+) unit\(s\) available for this space$/, 'Only {count} unit(s) available for this space.', 'count'],
    [/^Only (\d+) desk\(s\) remain in the selected period$/, 'Only {count} desk(s) remain in that period.', 'count'],
    [/^Cannot reduce inventory below reserved units\. Existing peak: (\d+)$/, 'Cannot reduce inventory below reserved units. Existing peak: {count}', 'count']
  ];
  for (const [pattern, source, name] of patterns) {
    const match = message.match(pattern);
    if (match) return t(source, {[name]:Object.hasOwn(messages, match[1]) ? t(match[1]) : match[1]});
  }
  if (message.startsWith('Public availability could not load:')) return t('The availability schedule could not load. Please try again or contact our team.');
  if (message.startsWith('Loading ')) return t('Unable to load workspace data. Please try again.');
  return message;
}
