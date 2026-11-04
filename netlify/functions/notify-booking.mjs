// Compatibility endpoint: all customer emails use the reservation outbox,
// selected provider, stable subject and staff authorization of the main sender.
export {createHandler,default} from './send-reservation-email.mjs';
export const config={path:'/.netlify/functions/notify-booking'};
