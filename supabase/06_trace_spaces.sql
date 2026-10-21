-- Optional additive venue catalog for a shared Supabase project.
-- Names and published capacities: https://tracesrilanka.lk/trace-spaces
-- All rates are illustrative demo estimates; Bay 07 capacity/equipment is estimated.
-- Existing spaces, bookings, inquiries and images are untouched. Rerunnable.
insert into public.spaces
  (name,type,capacity,inventory_count,amenities,rate_hour,rate_day,rate_week,rate_month,description,conditions,image_url)
select v.name,v.type,v.capacity,v.inventory_count,v.amenities,v.rate_hour,v.rate_day,v.rate_week,v.rate_month,v.description,v.conditions,v.image_url
from (values
  ('Creator Space','meeting',50,1,'A/C, Sound system, FM microphone, Lectern, Whiteboard, Projector',8000,45000,0,0,'Weekday space for workshops, training and meetings.','Weekdays only. Equipment included. Management approval is required for the event, external services and alcohol. Food is not provided; alcohol may be brought with approval but cannot be sold.',''),
  ('Bay 07','meeting',40,1,'Wi-Fi, A/C, Projector',6500,36000,0,0,'Demo training and mentorship venue. Capacity and equipment need confirmation from TRACE.','Management approval is required for the event, external services and alcohol. Food is not provided; alcohol may be brought with approval but cannot be sold.',''),
  ('Outdoor Space','auditorium',700,1,'Power, Security, Cleaning, Electrician, Chiller operation, Supervisor',35000,200000,0,0,'Weekend open-air venue for festivals, concerts and large gatherings.','Weekends only. Management approval is required for the event, external services and alcohol. Food is not provided; alcohol may be brought with approval but cannot be sold.',''),
  ('TRACE Idea Studio','desk',1,12,'Wi-Fi, Charging, A/C',0,2200,12000,39000,'Demo hotseats for innovators and entrepreneurs. The published studio supports groups of 10–15.','Minimum one day. Whole-studio events require a separate arrangement with TRACE management.',''),
  ('I Space','meeting',35,1,'Wi-Fi, A/C, Projector, Microphone',6000,34000,0,0,'Flexible room for workshops, presentations and team meetings.','Management approval is required for the event, external services and alcohol. Food is not provided; alcohol may be brought with approval but cannot be sold.',''),
  ('Neo Hub','auditorium',70,1,'Wi-Fi, A/C, Projector, Microphone',12000,70000,0,0,'Event venue for seminars, networking and launches.','Management approval is required for the event, external services and alcohol. Food is not provided; alcohol may be brought with approval but cannot be sold.',''),
  ('The Third Place Lobby','meeting',20,1,'Wi-Fi, A/C',5000,28000,0,0,'Welcoming venue for informal meetups and networking.','Management approval is required for the event, external services and alcohol. Food is not provided; alcohol may be brought with approval but cannot be sold.','')
) as v(name,type,capacity,inventory_count,amenities,rate_hour,rate_day,rate_week,rate_month,description,conditions,image_url)
where not exists(select 1 from public.spaces s where lower(s.name)=lower(v.name));
