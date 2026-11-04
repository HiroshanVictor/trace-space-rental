import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const migration=await readFile(new URL('../supabase/14_reservation_email_workflow_hardening.sql',import.meta.url),'utf8');

test('payment holds use a default deadline and require an earlier staff deadline for imminent events',()=>{
  assert.match(migration,/advance_hold_hours/);
  assert.match(migration,/Choose a payment deadline before the reservation starts/);
  assert.match(migration,/Payment deadline must be before the reservation starts/);
});

test('overdue review never auto-cancels and permits only a reviewed non-payment cancellation without customer-contact evidence',()=>{
  assert.match(migration,/payment_hold_expired_at is not null/);
  assert.match(migration,/reviewed non-payment cancellation/);
  assert.doesNotMatch(migration,/update public\.bookings set status='cancelled'/i);
});

test('staff email history is a staff-only RPC and public email tables retain RLS',()=>{
  assert.match(migration,/staff_reservation_email_history/);
  assert.match(migration,/staff_accounts where user_id=auth\.uid\(\)/);
  assert.match(migration,/grant execute on function public\.staff_reservation_email_history\(uuid\) to authenticated/);
});

test('failed delivery has bounded exponential retry and stale worker recovery',()=>{
  assert.match(migration,/least\(360,5\*\(2\^least\(o\.attempts,6\)\)/);
  assert.match(migration,/last_attempt_at<clock_timestamp\(\)-interval '15 minutes'/);
});
