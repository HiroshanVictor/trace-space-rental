import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {ALCOHOL_ACK_REQUIRED} from '../src/alcohol.js';

test('the alcohol migration enforces inquiry and reservation declarations in PostgreSQL',async context=>{
  const db=await PGlite.create();
  try{
    await db.exec(`
      create role anon;
      create table public.inquiries(id serial primary key,alcohol_planned boolean not null default false,alcohol_terms_accepted boolean not null default false,status text default 'new');
      create table public.bookings(id serial primary key,alcohol_planned boolean not null default false,alcohol_terms_accepted boolean not null default false,status text default 'pending');
      alter table public.inquiries enable row level security;
      alter table public.bookings enable row level security;
      create policy inquiry_insert on public.inquiries for insert to anon with check(status='new');
      grant insert on public.inquiries to anon;
      grant usage on sequence public.inquiries_id_seq to anon;
      insert into public.inquiries(alcohol_planned,alcohol_terms_accepted) values(true,false),(false,true);
      insert into public.bookings(alcohol_planned,alcohol_terms_accepted) values(true,false),(false,true);
    `);
    const beforePolicies=await db.query('select * from pg_policies order by tablename,policyname');
    const migration=await readFile(new URL('../supabase/15_alcohol_acknowledgement.sql',import.meta.url),'utf8');
    await db.exec(migration);

    await context.test('migration is repeatable and preserves existing records and RLS',async()=>{
      await db.exec(migration);
      assert.deepEqual((await db.query('select * from pg_policies order by tablename,policyname')).rows,beforePolicies.rows);
      for(const table of ['inquiries','bookings']){
        assert.deepEqual((await db.query(`select alcohol_planned,alcohol_terms_accepted from ${table} order by id`)).rows,[{alcohol_planned:true,alcohol_terms_accepted:false},{alcohol_planned:false,alcohol_terms_accepted:true}]);
        assert.equal((await db.query('select relrowsecurity from pg_class where oid=$1::regclass',[`public.${table}`])).rows[0].relrowsecurity,true);
        await db.query(`update ${table} set status='legacy-review' where id=1`);
      }
    });

    await context.test('both tables reject unacknowledged Yes, including a direct SQL bypass',async()=>{
      for(const table of ['inquiries','bookings']){
        await assert.rejects(db.query(`insert into ${table}(alcohol_planned) values(true)`),error=>error.code==='23514'&&error.message===ALCOHOL_ACK_REQUIRED);
        await assert.rejects(db.query(`update ${table} set alcohol_planned=true,alcohol_terms_accepted=false where id=2`),error=>error.code==='23514');
      }
    });

    await context.test('No, acknowledged Yes, edits and inquiry conversion persist their booleans',async()=>{
      const inquiry=(await db.query('insert into inquiries(alcohol_planned,alcohol_terms_accepted) values(true,true) returning *')).rows[0];
      const reservation=(await db.query('insert into bookings(alcohol_planned,alcohol_terms_accepted) select alcohol_planned,alcohol_terms_accepted from inquiries where id=$1 returning *',[inquiry.id])).rows[0];
      assert.equal(reservation.alcohol_planned,true);assert.equal(reservation.alcohol_terms_accepted,true);
      await db.query('update bookings set alcohol_planned=false,alcohol_terms_accepted=false where id=$1',[reservation.id]);
      const edited=(await db.query('select * from bookings where id=$1',[reservation.id])).rows[0];
      assert.equal(edited.alcohol_planned,false);assert.equal(edited.alcohol_terms_accepted,false);
      await db.query('insert into inquiries(alcohol_planned,alcohol_terms_accepted) values(false,false)');
      await db.query('insert into bookings(alcohol_planned,alcohol_terms_accepted) values(false,false)');
    });

    await context.test('anonymous inserts remain private and cannot bypass the alcohol trigger',async()=>{
      await db.exec('set role anon');
      try{
        await db.query('insert into inquiries(alcohol_planned,alcohol_terms_accepted) values(false,false)');
        await assert.rejects(db.query('insert into inquiries(alcohol_planned,alcohol_terms_accepted) values(true,false)'),error=>error.code==='23514');
        await assert.rejects(db.query('select * from inquiries'),error=>error.code==='42501');
        await assert.rejects(db.query('select * from bookings'),error=>error.code==='42501');
      }finally{await db.exec('reset role');}
    });
  }finally{await db.close();}
});
