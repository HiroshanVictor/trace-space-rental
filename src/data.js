import {quoteBooking} from './engine.js';
import {realSpaces} from './realSpaces.js';
import {venueImages} from './venueImages.js';
const id = prefix => `${prefix}-${Math.random().toString(36).slice(2,10)}`;
const plus = (days, hours=0) => {
  const d=new Date(); d.setHours(hours,0,0,0); d.setDate(d.getDate()+days); return d.toISOString();
};
export const imageSet = {
  meeting:venueImages['Meeting Room A'],
  training:venueImages['Creator Space'],
  auditorium:venueImages['Grand Auditorium'],
  desk:venueImages['Co-working Desk Zone'],
  creator:venueImages['Creator Space'],
  bay07:venueImages['Bay 07'],
  outdoor:venueImages['Outdoor Space'],
  idea:venueImages['TRACE Idea Studio'],
  ispace:venueImages['I Space'],
  neohub:venueImages['Neo Hub'],
  lobby:venueImages['The Third Place Lobby'],
};
export function makeSeed(){
  const spaces=realSpaces(imageSet);
  const customers=[
    {id:'cust-1',full_name:'Nimali Perera',email:'nimali@example.com',phone:'+94 77 123 4567',company:'NexTech Lanka',notes:'Regular training client',created_at:new Date().toISOString()},
    {id:'cust-2',full_name:'Akash Fernando',email:'akash@example.com',phone:'+94 71 234 5678',company:'Independent Consultant',notes:'',created_at:new Date().toISOString()},
    {id:'cust-3',full_name:'Fathima Rizna',email:'rizna@example.com',phone:'+94 76 345 6789',company:'Orbit Events',notes:'',created_at:new Date().toISOString()}
  ];
  const bookingSpec=[
    {id:'bk-1',reference:'TEC-260001',space_id:'space-ispace',customer_id:'cust-1',customer_name:'Nimali Perera',customer_email:'nimali@example.com',customer_phone:'+94 77 123 4567',start_at:plus(1,9),end_at:plus(1,12),units_reserved:1,rate_type:'hour',status:'confirmed',payment_status:'paid',amount_paid:18000,payment_method:'bank_transfer',purpose:'Quarterly planning meeting',attendees:7,special_requests:'',internal_notes:'',discount:0},
    {id:'bk-2',reference:'TEC-260002',space_id:'space-creator',customer_id:'cust-3',customer_name:'Fathima Rizna',customer_email:'rizna@example.com',customer_phone:'+94 76 345 6789',start_at:plus(2,10),end_at:plus(2,16),units_reserved:1,rate_type:'hour',status:'confirmed',payment_status:'partial',amount_paid:12000,payment_method:'bank_transfer',purpose:'Leadership workshop',attendees:27,special_requests:'U-shaped seating',internal_notes:'Confirm projector',discount:0},
    {id:'bk-3',reference:'TEC-260003',space_id:'space-idea',customer_id:'cust-2',customer_name:'Akash Fernando',customer_email:'akash@example.com',customer_phone:'+94 71 234 5678',start_at:plus(1,8),end_at:plus(8,8),units_reserved:3,rate_type:'week',status:'pending',payment_status:'unpaid',amount_paid:0,payment_method:'cash',purpose:'Team coworking',attendees:3,special_requests:'Seats together',internal_notes:'',discount:0}
  ];
  const bookings=bookingSpec.map(b=>({...b, amount:quoteBooking(spaces.find(s=>s.id===b.space_id),b).total,created_at:new Date().toISOString()}));
  return {spaces,customers,bookings,inquiries:[
    {id:'inq-1',name:'Kasun Silva',email:'kasun@example.com',phone:'+94 77 555 4000',space_id:'space-neohub',start_at:plus(7,9),end_at:plus(7,17),message:'Please share the available equipment and event conditions.',status:'new',created_at:new Date().toISOString()},
    {id:'inq-2',name:'Sajini Dias',email:'sajini@example.com',phone:'+94 76 222 3333',space_id:'space-lobby',start_at:plus(4,13),end_at:plus(4,16),message:'Meeting for 12 attendees.',status:'contacted',created_at:new Date().toISOString()}
  ],blackouts:[{id:'block-1',space_id:'space-neohub',start_at:plus(4,8),end_at:plus(4,18),reason:'Scheduled maintenance',created_at:new Date().toISOString()}],settings:{id:1,company_name:'Trace Expert City',email:'',phone:'',address:'Sri Lanka',currency:'LKR',opening_hours:'8:00 AM – 8:00 PM',about:'Inspiring spaces for meetings, learning, events, and work.'}};
}
export {id};
