import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('dummy checkout executes against PostgreSQL with existing booking and email triggers',async context=>{
  const db=await PGlite.create();
  try{
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select null::uuid $$;`);
    for(const name of ['01_schema','05_trace_booking_policy','12_reservation_email_conversations','13_fix_reservation_email_rls','14_reservation_email_workflow_hardening','15_alcohol_acknowledgement']){
      let sql=await readFile(new URL(`../supabase/${name}.sql`,import.meta.url),'utf8');
      sql=sql.replace(/create extension if not exists pgcrypto;/i,''); // gen_random_uuid is built into PostgreSQL.
      await db.exec(sql);
    }
    const migration=await readFile(new URL('../supabase/16_dummy_reservation_payments.sql',import.meta.url),'utf8');
    await db.exec(migration);await db.exec(migration);
    let count=0;
    const booking=async()=>{
      const space=(await db.query(`insert into spaces(name,type,capacity,inventory_count,rate_hour) values('Payment test','meeting',20,1,10000) returning id`)).rows[0];
      const row=(await db.query(`insert into bookings(reference,space_id,customer_name,customer_email,start_at,end_at,rate_type,amount,amount_paid,status,payment_deadline_at,payment_gateway)
        values($1,$2,'Payment customer','customer@example.test','2099-11-04T09:00:00Z','2099-11-04T11:00:00Z','hour',10000,0,'pending',now()+interval '72 hours','dummy') returning *`,['PAY-'+(++count),space.id])).rows[0];
      return row;
    };
    const request=async b=>(await db.query('select * from ensure_dummy_reservation_payment($1)',[b.id])).rows[0];

    await context.test('saving queues approval; paying half confirms once and queues one confirmation',async()=>{
      const b=await booking();
      assert.equal(b.status,'pending');
      const pending=(await db.query('select event_type from reservation_email_outbox where booking_id=$1',[b.id])).rows;
      assert.deepEqual(pending,[{event_type:'advance_payment_requested'}]);
      const p=await request(b);assert.equal(Number(p.amount_requested),5000);
      assert.equal((await request(b)).id,p.id,'Email retries reuse the same request');
      const result=await Promise.all([db.query('select * from complete_dummy_reservation_payment($1)',[p.id]),db.query('select * from complete_dummy_reservation_payment($1)',[p.id])]);
      assert.deepEqual(result.map(x=>x.rows[0].status),['confirmed','already_paid']);
      const saved=(await db.query('select * from bookings where id=$1',[b.id])).rows[0];
      assert.equal(saved.status,'confirmed');assert.equal(Number(saved.amount_paid),5000);assert.equal(saved.payment_status,'partial');
      assert.match(saved.payment_reference,/^DUMMY-/);assert.ok(saved.payment_received_at);
      assert.equal((await db.query(`select count(*)::int as n from reservation_email_outbox where booking_id=$1 and event_type='reservation_confirmed'`,[b.id])).rows[0].n,1);
    });
    await context.test('staff cannot confirm or forge an advance, and an emailed quote cannot be changed',async()=>{
      const b=await booking();await request(b);
      await assert.rejects(db.query(`update bookings set status='confirmed',amount_paid=5000 where id=$1`,[b.id]),/checkout/);
      await assert.rejects(db.query(`update bookings set payment_gateway='manual' where id=$1`,[b.id]),/cannot be changed/);
      await assert.rejects(db.query(`update bookings set amount=12000 where id=$1`,[b.id]),/payment link/);
      assert.equal((await db.query('select status from bookings where id=$1',[b.id])).rows[0].status,'pending');
    });
    await context.test('cancelled and expired reservations cannot be paid',async()=>{
      const b=await booking(),p=await request(b);
      await db.query(`update bookings set status='cancelled',cancellation_called_at=now(),cancellation_email_received_at=now() where id=$1`,[b.id]);
      await assert.rejects(db.query('select * from complete_dummy_reservation_payment($1)',[p.id]),/unavailable/);
      const expired=await booking(),e=await request(expired);
      await db.query(`update reservation_dummy_payments set expires_at=now()-interval '1 minute' where id=$1`,[e.id]);
      await assert.rejects(db.query('select * from complete_dummy_reservation_payment($1)',[e.id]),/expired/);
      assert.equal((await db.query('select status from bookings where id=$1',[expired.id])).rows[0].status,'pending');
    });
    await context.test('existing capacity checks roll back payment and confirmation together',async()=>{
      const b=await booking(),p=await request(b);
      await db.query('update spaces set is_active=false where id=$1',[b.space_id]);
      await assert.rejects(db.query('select * from complete_dummy_reservation_payment($1)',[p.id]),/archived/);
      assert.equal((await db.query('select status from reservation_dummy_payments where id=$1',[p.id])).rows[0].status,'pending');
      assert.equal(Number((await db.query('select amount_paid from bookings where id=$1',[b.id])).rows[0].amount_paid),0);
    });
    await context.test('anonymous and authenticated roles cannot read payment records or invoke checkout RPCs',async()=>{
      const b=await booking(),p=await request(b);
      for(const role of ['anon','authenticated']){
        await db.exec(`set role ${role}`);
        try{
          await assert.rejects(db.query('select * from reservation_dummy_payments'),error=>error.code==='42501');
          for(const name of ['ensure_dummy_reservation_payment','view_dummy_reservation_payment','complete_dummy_reservation_payment'])
            await assert.rejects(db.query(`select * from ${name}($1)`,[name.startsWith('ensure')?b.id:p.id]),error=>error.code==='42501');
        }finally{await db.exec('reset role')}
      }
    });
  }finally{await db.close()}
});
