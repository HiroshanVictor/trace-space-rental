import {notifyInquiry} from './inquiryNotifications.js';
import {sendInquiryReservationEmail} from './reservationEmails.js';

/** Deliver notifications only after the inquiry has been saved successfully. */
export async function notifySavedInquiry({staffEndpoint,reservationEndpoint,inquiryId,fetchImpl=globalThis.fetch}={}){
  const [staff,customer]=await Promise.all([
    notifyInquiry(staffEndpoint,inquiryId,{fetchImpl}),
    sendInquiryReservationEmail(reservationEndpoint,inquiryId,{fetchImpl})
  ]);
  return {staff,customer};
}

/** Success requires acceptance of both independent notifications. A staff-only
 * success must never hide a failed or disabled customer acknowledgement. */
export function inquiryDeliverySummary({staff,customer}={}){
  const staffAccepted=staff?.status==='sent';
  const customerAccepted=['accepted','already_accepted'].includes(customer?.status);
  if(staffAccepted&&customerAccepted)return {status:'sent',message:'Inquiry saved. Staff and customer emails were accepted for sending.'};
  if(staffAccepted)return {status:'pending',message:'Inquiry saved. Staff notified; customer email is pending.'};
  if(customerAccepted)return {status:'pending',message:'Inquiry saved. Customer email accepted; staff notification is pending.'};
  return {status:'pending',message:'Inquiry saved. Both email notifications are pending. Please do not submit again.'};
}
