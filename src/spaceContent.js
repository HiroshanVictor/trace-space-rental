import {t} from './i18n.js';
import {realSpaces} from './realSpaces.js';

// Translate original sample content for display. Edited and newly entered content
// stays exactly as staff wrote it, including inside edit forms and CSV exports.
const originals = {
  'space-meeting-a':{name:'Meeting Room A',description:'A bright, focused meeting environment for smaller teams.',amenities:'Wi-Fi, Projector, Whiteboard, AC'},
  'space-meeting-b':{name:'Executive Meeting Room',description:'A refined collaboration space for important conversations.',amenities:'Wi-Fi, Video conferencing, Smart TV, AC'},
  'space-training':{name:'Training Studio',description:'Configurable seating for workshops and training sessions.',amenities:'Wi-Fi, Projector, Sound, Whiteboard'},
  'space-hall':{name:'Grand Auditorium',description:'A large, modern auditorium for conferences and presentations.',amenities:'Stage, PA system, Projection, AC, Backstage'},
  'space-desks':{name:'Co-working Desk Zone',description:'Flexible desks for freelancers and growing teams.',amenities:'Fast Wi-Fi, Charging, Shared kitchen, AC'}
};
const realByName=Object.fromEntries(realSpaces({meeting:'',training:'',auditorium:'',desk:''}).map(space=>[space.name,space]));

export function spaceText(space, field = 'name') {
  const value = space?.[field] || '';
  const original=originals[space?.id]||realByName[space?.name];
  return original?.[field] === value ? t(value) : value;
}

export function companyAbout(settings) {
  const value = settings?.about || '';
  return value === 'Inspiring spaces for meetings, learning, events, and work.' ? t(value) : value;
}
