import {safeHtml as h} from './engine.js';
import {getLanguage,languages,t} from './i18n.js';

export function languageSelector() {
  return `<label class="language-switcher"><svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a17 17 0 0 1 0 18 17 17 0 0 1 0-18"/></svg><span class="sr-only">${h(t('Language'))}</span><select data-language aria-label="${h(t('Language'))}">${languages.map(({code,name}) => `<option lang="${code}" value="${code}" ${getLanguage() === code ? 'selected' : ''}>${name}</option>`).join('')}</select></label>`;
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
      const el = form.elements.namedItem(field.name);
      if (!el) continue;
      el.value = field.value;
      if (el.type === 'checkbox' || el.type === 'radio') el.checked = field.checked;
    }
  }
}

export function localizeValidation(input) {
  if (!input.willValidate || typeof input.setCustomValidity !== 'function') return;
  input.setCustomValidity('');
  const valid = input.validity;
  let message = '';
  if (valid.valueMissing) message = t('Please fill out this field.');
  else if (valid.typeMismatch) message = t(input.type === 'email' ? 'Please enter a valid email address.' : 'Please enter a valid URL.');
  else if (valid.rangeUnderflow) message = t('Please enter a value of at least {min}.',{min:input.min});
  else if (valid.rangeOverflow) message = t('Please enter a value no greater than {max}.',{max:input.max});
  else if (!valid.valid) message = t('Please enter a valid value.');
  input.setCustomValidity(message);
}
