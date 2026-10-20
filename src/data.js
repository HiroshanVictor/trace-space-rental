import {quoteBooking} from './engine.js';
const id = prefix => `${prefix}-${Math.random().toString(36).slice(2,10)}`;
const plus = (days, hours=0) => {
  const d=new Date(); d.setHours(hours,0,0,0); d.setDate(d.getDate()+days); return d.toISOString();
};
export const imageSet = {
  meeting:'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=1100&auto=format&fit=crop&q=85',
  training:'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1100&auto=format&fit=crop&q=85',
  auditorium:'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=1100&auto=format&fit=crop&q=85',
  desk:'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1100&auto=format&fit=crop&q=85',
};
export function makeSeed(){
  const spaces=[
    {id:'space-meeting-a',name:'Meeting Room A',type:'meeting',capacity:8,inventory_count:1,amenities:'Wi-Fi, Projector, Whiteboard, AC',rate_hour:1600,rate_day:9000,rate_week:0,rate_month:0,description:'A bright, focused meeting environment for smaller teams.',conditions:'No smoking. Outside catering with prior approval.',image_url:imageSet.meeting,is_active:true,created_at:new Date().toISOString()},
    {id:'space-meeting-b',name:'Executive Meeting Room',type:'meeting',capacity:16,inventory_count:1,amenities:'Wi-Fi, Video conferencing, Smart TV, AC',rate_hour:2500,rate_day:14000,rate_week:0,rate_month:0,description:'A refined collaboration space for important conversations.',conditions:'Return all shared equipment after use.',image_url:imageSet.training,is_active:true,created_at:new Date().toISOString()},
    {id:'space-training',name:'Training Studio',type:'meeting',capacity:35,inventory_count:1,amenities:'Wi-Fi, Projector, Sound, Whiteboard',rate_hour:3500,rate_day:20000,rate_week:0,rate_month:0,description:'Configurable seating for workshops and training sessions.',conditions:'Set-up requests must be made one day in advance.',image_url:imageSet.training,is_active:true,created_at:new Date().toISOString()},
    {id:'space-hall',name:'Grand Auditorium',type:'auditorium',capacity:220,inventory_count:1,amenities:'Stage, PA system, Projection, AC, Backstage',rate_hour:12000,rate_day:68000,rate_week:0,rate_month:0,description:'A large, modern auditorium for conferences and presentations.',conditions:'Event setup and technical requirements require confirmation.',image_url:imageSet.auditorium,is_active:true,created_at:new Date().toISOString()},
    {id:'space-desks',name:'Co-working Desk Zone',type:'desk',capacity:1,inventory_count:14,amenities:'Fast Wi-Fi, Charging, Shared kitchen, AC',rate_hour:0,rate_day:1200,rate_week:6500,rate_month:21000,description:'Flexible desks for freelancers and growing teams.',conditions:'Each unit is one desk. Monthly rate represents a 30-day billing block.',image_url:imageSet.desk,is_active:true,created_at:new Date().toISOString()}
  ];
  const customers=[
    {id:'cust-1',full_name:'Nimali Perera',email:'nimali@example.com',phone:'+94 77 123 4567',company:'NexTech Lanka',notes:'Regular training client',created_at:new Date().toISOString()},
    {id:'cust-2',full_name:'Akash Fernando',email:'akash@example.com',phone:'+94 71 234 5678',company:'Independent Consultant',notes:'',created_at:new Date().toISOString()},
    {id:'cust-3',full_name:'Fathima Rizna',email:'rizna@example.com',phone:'+94 76 345 6789',company:'Orbit Events',notes:'',created_at:new Date().toISOString()}
  ];
  const bookingSpec=[
    {id:'bk-1',reference:'TEC-260001',space_id:'space-meeting-a',customer_id:'cust-1',customer_name:'Nimali Perera',customer_email:'nimali@example.com',customer_phone:'+94 77 123 4567',start_at:plus(1,9),end_at:plus(1,12),units_reserved:1,rate_type:'hour',status:'confirmed',payment_status:'paid',amount_paid:4800,payment_method:'bank_transfer',purpose:'Quarterly planning meeting',attendees:7,special_requests:'',internal_notes:'',discount:0},
    {id:'bk-2',reference:'TEC-260002',space_id:'space-training',customer_id:'cust-3',customer_name:'Fathima Rizna',customer_email:'rizna@example.com',customer_phone:'+94 76 345 6789',start_at:plus(2,10),end_at:plus(2,16),units_reserved:1,rate_type:'hour',status:'confirmed',payment_status:'partial',amount_paid:6000,payment_method:'bank_transfer',purpose:'Leadership workshop',attendees:27,special_requests:'U-shaped seating',internal_notes:'Confirm projector',discount:0},
    {id:'bk-3',reference:'TEC-260003',space_id:'space-desks',customer_id:'cust-2',customer_name:'Akash Fernando',customer_email:'akash@example.com',customer_phone:'+94 71 234 5678',start_at:plus(1,8),end_at:plus(8,8),units_reserved:3,rate_type:'week',status:'pending',payment_status:'unpaid',amount_paid:0,payment_method:'cash',purpose:'Team coworking',attendees:3,special_requests:'Seats together',internal_notes:'',discount:0}
  ];
  const bookings=bookingSpec.map(b=>({...b, amount:quoteBooking(spaces.find(s=>s.id===b.space_id),b).total,created_at:new Date().toISOString()}));
  return {spaces,customers,bookings,inquiries:[
    {id:'inq-1',name:'Kasun Silva',email:'kasun@example.com',phone:'+94 77 555 4000',space_id:'space-hall',start_at:plus(7,9),end_at:plus(7,17),message:'Please share the available equipment and event conditions.',status:'new',created_at:new Date().toISOString()},
    {id:'inq-2',name:'Sajini Dias',email:'sajini@example.com',phone:'+94 76 222 3333',space_id:'space-meeting-b',start_at:plus(4,13),end_at:plus(4,16),message:'Meeting for 12 attendees.',status:'contacted',created_at:new Date().toISOString()}
  ],blackouts:[{id:'block-1',space_id:'space-hall',start_at:plus(4,8),end_at:plus(4,18),reason:'Scheduled maintenance',created_at:new Date().toISOString()}],settings:{id:1,company_name:'Trace Expert City',email:'',phone:'',address:'Sri Lanka',currency:'LKR',opening_hours:'8:00 AM – 8:00 PM',about:'Inspiring spaces for meetings, learning, events, and work.'}};
}
export {id};
