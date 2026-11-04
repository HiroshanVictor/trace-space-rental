import {safeHtml as h} from './engine.js';
import {getLanguage,languages,t} from './i18n.js';
import {syncAlcoholFields} from './alcoholUI.js';
import {ALCOHOL_ACK_REQUIRED} from './alcohol.js';

export function languageSelector({compact=false} = {}) {
  const current=languages.find(language=>language.code===getLanguage());
  const label=`${h(t('Language'))}: ${h(current.name)}`;
  return `<details class="language-switcher${compact?' language-switcher-compact':''}">
    <summary data-language-toggle aria-label="${label}" title="${label}"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 8 6 6M4 14l6-6 2-3M2 5h12M7 2h1m14 20-5-11-5 11M14 18h6"/></svg></summary>
    <div class="language-options" role="group" aria-label="${h(t('Language'))}">${languages.map(({code,name}) => `<button type="button" data-language="${code}" lang="${code}" translate="no" aria-pressed="${current.code===code}"><span>${name}</span>${current.code===code?'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>':''}</button>`).join('')}</div>
  </details>`;
}

// A language change must preserve an inquiry or reservation the user is editing.
export function captureForms(root) {
  return Array.from(root.querySelectorAll('form')).map(form => ({
    type:form.dataset.form,
    id:form.dataset.id,
    fields:Array.from(form.elements).filter(el => el.name).map(el => ({
      name:el.name, value:el.value, checked:el.checked
    }))
  }));
}

export function restoreForms(root, snapshots) {
  for (const snapshot of snapshots) {
    const form = Array.from(root.querySelectorAll('form')).find(el => el.dataset.form === snapshot.type && el.dataset.id === snapshot.id);
    if (!form) continue;
    for (const field of snapshot.fields) {
      const named = form.elements.namedItem(field.name);
      // RadioNodeList.value alone would select the last radio in the snapshot.
      const el = named?.length&&!named.tagName?Array.from(named).find(input=>input.value===field.value):named;
      if (!el) continue;
      if(el.type!=='radio')el.value = field.value;
      if (el.type === 'checkbox' || el.type === 'radio') el.checked = field.checked;
    }
    syncAlcoholFields(form);
  }
}

export function localizeValidation(input) {
  if (!input.willValidate || typeof input.setCustomValidity !== 'function') return;
  input.setCustomValidity('');
  const valid = input.validity;
  let message = '';
  if (valid.valueMissing) message = input.matches('[data-alcohol-acknowledgement]')?t(ALCOHOL_ACK_REQUIRED):t('Please fill out this field.');
  else if (valid.typeMismatch) message = t(input.type === 'email' ? 'Please enter a valid email address.' : 'Please enter a valid URL.');
  else if (valid.rangeUnderflow) message = t('Please enter a value of at least {min}.',{min:input.min});
  else if (valid.rangeOverflow) message = t('Please enter a value no greater than {max}.',{max:input.max});
  else if (!valid.valid) message = t('Please enter a valid value.');
  input.setCustomValidity(message);
}
