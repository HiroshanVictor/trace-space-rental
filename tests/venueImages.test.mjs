import test from 'node:test';
import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {venueImages,venueImageFor} from '../src/venueImages.js';

test('every named venue has a distinct image that is included in the site',async()=>{
  const paths=Object.values(venueImages);
  assert.equal(paths.length,11);
  assert.equal(new Set(paths).size,paths.length);
  for(const path of paths)await access(fileURLToPath(new URL('..'+path,import.meta.url)));
});

test('old starter images are corrected while staff supplied custom images remain available',()=>{
  assert.equal(venueImageFor({name:'Creator Space',image_url:'/public/assets/trace-baobab-room.webp'}),venueImages['Creator Space']);
  assert.equal(venueImageFor({name:'Outdoor Space',image_url:'/public/assets/trace-bay-07.jpg'}),venueImages['Outdoor Space']);
  assert.equal(venueImageFor({name:'Bay 07',image_url:'https://tracesrilanka.lk/api/media/file/trace-home.webp'}),venueImages['Bay 07']);
  assert.equal(venueImageFor({name:'Bay 07',image_url:'https://example.com/my-bay.jpg'}),'https://example.com/my-bay.jpg');
});
