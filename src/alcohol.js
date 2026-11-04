export const ALCOHOL_ACK_REQUIRED='Please acknowledge that alcohol requires management approval and may not be sold.';
const yes=value=>value===true||value==='yes'||value==='true'||value==='on';

// These are declarations and acknowledgements, never management approval.
export function alcoholValues(record={}){
  return {alcohol_planned:yes(record?.alcohol_planned),alcohol_terms_accepted:yes(record?.alcohol_terms_accepted)};
}

export function validateAlcohol(record){
  const values=alcoholValues(record);
  if(values.alcohol_planned&&!values.alcohol_terms_accepted)throw Error(ALCOHOL_ACK_REQUIRED);
  return values;
}

export function readAlcoholForm(form){
  return validateAlcohol({alcohol_planned:form.elements.namedItem('alcohol_planned')?.value,
    alcohol_terms_accepted:form.elements.namedItem('alcohol_terms_accepted')?.checked===true});
}
