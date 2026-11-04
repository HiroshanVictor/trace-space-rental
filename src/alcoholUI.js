import {safeHtml as h} from './engine.js';
import {t} from './i18n.js';
import {alcoholValues} from './alcohol.js';

export function alcoholFields(record={},prefix='event'){
  const {alcohol_planned:planned,alcohol_terms_accepted:accepted}=alcoholValues(record);
  return `<fieldset class="alcohol-options" data-alcohol-fields aria-describedby="${prefix}-alcohol-note">
    <legend>${h(t('Will alcohol be brought or consumed at this event?'))}</legend>
    <div class="alcohol-choices">
      <label class="alcohol-control" for="${prefix}-alcohol-yes"><input id="${prefix}-alcohol-yes" type="radio" name="alcohol_planned" value="yes" ${planned?'checked':''} required><span>${h(t('Yes'))}</span></label>
      <label class="alcohol-control" for="${prefix}-alcohol-no"><input id="${prefix}-alcohol-no" type="radio" name="alcohol_planned" value="no" ${planned?'':'checked'} required><span>${h(t('No'))}</span></label>
    </div>
    <div data-alcohol-acknowledgement-row ${planned?'':'hidden'}>
      <label class="alcohol-control alcohol-acknowledgement" for="${prefix}-alcohol-ack"><input id="${prefix}-alcohol-ack" type="checkbox" name="alcohol_terms_accepted" value="true" data-alcohol-acknowledgement ${accepted?'checked':''} ${planned?'required':'disabled'}><span>${h(t('I understand that alcohol requires management approval and may not be sold.'))}</span></label>
    </div>
    <p id="${prefix}-alcohol-note" class="note alcohol-approval-note">${h(t('Declaring alcohol consumption does not mean management approval has been granted.'))}</p>
  </fieldset>`;
}

export function syncAlcoholFields(root,{resetAcknowledgement=false}={}){
  for(const group of root.querySelectorAll('[data-alcohol-fields]')){
    const planned=group.querySelector('input[name="alcohol_planned"]:checked')?.value==='yes';
    const row=group.querySelector('[data-alcohol-acknowledgement-row]');
    const ack=group.querySelector('[data-alcohol-acknowledgement]');
    if(resetAcknowledgement)ack.checked=false;
    row.hidden=!planned;ack.disabled=!planned;ack.required=planned;
    ack.setCustomValidity('');
  }
}
