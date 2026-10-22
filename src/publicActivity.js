const BOOKING_STATUSES=new Set(['pending','confirmed','completed']);

export function summarizeBookingCounts(bookings,now=new Date()){
  const year=now.getUTCFullYear(),month=now.getUTCMonth();
  const counts={total:0,month:0,year:0};
  for(const booking of bookings||[]){
    if(!BOOKING_STATUSES.has(booking.status))continue;
    counts.total++;
    const createdAt=new Date(booking.created_at);
    if(Number.isNaN(createdAt.getTime()))continue;
    if(createdAt.getUTCFullYear()===year){
      counts.year++;
      if(createdAt.getUTCMonth()===month)counts.month++;
    }
  }
  return counts;
}

export function summarizeSpaceActivity(spaces,bookings){
  return (spaces||[]).filter(space=>space.is_active).map(space=>{
    const active=(bookings||[]).filter(booking=>booking.space_id===space.id&&BOOKING_STATUSES.has(booking.status));
    const latest=active.reduce((value,booking)=>!value||new Date(booking.created_at)>new Date(value)?booking.created_at:value,null);
    return {space_id:space.id,booking_count:active.length,latest_booking_at:latest};
  });
}

export function rankSpaceActivity(spaces,activity,sort='popular'){
  const rows=new Map((activity||[]).map(row=>[String(row.space_id),row]));
  return (spaces||[]).filter(space=>space.is_active&&Number(rows.get(String(space.id))?.booking_count||0)>0).map(space=>({
    space,
    booking_count:Number(rows.get(String(space.id))?.booking_count||0),
    latest_booking_at:rows.get(String(space.id))?.latest_booking_at||null
  })).sort((a,b)=>{
    const firstDate=a.latest_booking_at?new Date(a.latest_booking_at).getTime():0;
    const secondDate=b.latest_booking_at?new Date(b.latest_booking_at).getTime():0;
    if(sort==='latest'&&(firstDate!==secondDate))return secondDate-firstDate;
    if(sort==='popular'&&a.booking_count!==b.booking_count)return b.booking_count-a.booking_count;
    if(a.booking_count!==b.booking_count)return b.booking_count-a.booking_count;
    return a.space.name.localeCompare(b.space.name);
  });
}
