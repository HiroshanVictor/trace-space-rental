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
