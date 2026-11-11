# Approval email and dummy customer checkout

New reservations created with `paymentGateway: 'dummy'` stay **Pending** with no
recorded payment. Saving approves the request and queues the existing
`advance_payment_requested` email. It uses the saved customer address and the
existing reservation subject/thread. The email includes:

> Your reservation has been approved, please make a half payment to confirm it. Click this link:

It also includes the total, 50% advance, remaining balance, payment deadline,
configured company payment instructions and an expiring link back to this site.
The link opens a customer checkout that needs no staff account. The customer
acknowledges test mode and clicks **Simulate payment and confirm reservation**.
There are no card or bank detail fields and no real payment processor calls.

The server records the simulated advance and changes the reservation to
**Confirmed** in one database transaction. The unpaid remainder stays outstanding;
payment status is **Partial**. A confirmation email is queued in the same existing
conversation. The receipt reference starts with `DUMMY-`; staff details and customer
emails identify this as a test payment. Existing manual reservations keep their
existing workflow and advance rules.

## Deployment setup

1. Keep existing data. Apply any missing email migrations **12, 13, 14**, then
   **15**, followed by
   [16_dummy_reservation_payments.sql](../supabase/16_dummy_reservation_payments.sql)
   in Supabase SQL Editor. The new migration adds a gateway flag, private payment
   request table and protected RPCs. Existing bookings default to `manual`.
2. In **Netlify → Project configuration → Environment variables**, add:

   | Variable | Value / scope |
   | --- | --- |
   | `PAYMENT_GATEWAY` | `dummy` — Builds and Functions |
   | `PAYMENT_LINK_SECRET` | A newly generated random secret of at least 32 characters — Functions only |
   | `PAYMENT_SITE_URL` | Your actual deployed site origin, e.g. `https://your-site.netlify.app` — Functions only |
   | `SCHEDULER_SECRET` | Keep/set the existing private email worker secret — Functions only |

   Netlify's `URL` is used if `PAYMENT_SITE_URL` is absent. An explicit canonical
   site URL is recommended; the email never trusts a visitor-supplied Host header.
   Keep the existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and configured
   email-provider variables. Gmail remains supported; see
   [GMAIL_SMTP_SETUP.md](../GMAIL_SMTP_SETUP.md). Never put signing keys, service-role
   keys or SMTP passwords in `config.js`.
3. `config.js` enables the public `paymentGateway: 'dummy'` flag. The build script
   preserves it or reads `PAYMENT_GATEWAY`; it never exports the signing secret.
   Deploy the frontend and Netlify Functions together after applying migration 16.

No migration, deployment, live email or real charge is performed by the automated
tests. Apply the migration and deploy when ready to enable the live-site test.

## Live-site test

1. Submit a public inquiry using a customer mailbox you control. Check the existing
   staff notification and customer acknowledgement.
2. In Staff → Customer Inquiries, convert the inquiry and **Save reservation**.
   The reservation must remain Pending, with amount received zero. The customer
   should receive the approval email with a 50% payment link.
3. Open the link as a guest. Verify the reference, venue, dates, total, advance,
   remaining balance and clear test-mode notice.
4. Accept the test acknowledgement and simulate payment. The checkout should show
   confirmation. Reload the staff Reservations page: it should show Confirmed,
   the half-payment recorded and a `DUMMY-` reference. Check the customer mailbox
   for the threaded confirmation email.
5. Reload the payment link or retry the request: it must not add another advance
   or another confirmation outbox event. Cancelled or expired links cannot be paid.

If email sending fails, the reservation remains saved; use **Retry customer email**
in its staff details. Scheduled outbox retries still run every five minutes. A
payment remains confirmed even if its confirmation email needs retry. Provider
acceptance is not a guarantee of inbox delivery; SMTP also does not guarantee
exactly-once email delivery.

## Limits and protections

- This gateway records **simulated payments only**. Keep `PAYMENT_GATEWAY=dummy`
  limited to testing until a real payment provider with verified server callbacks
  is implemented. It must not be represented as a real-money payment gateway.
- Half-payment amounts round up to whole LKR, consistent with existing advance
  validation. The customer sees the exact amount before submitting.
- The payment link is a bearer capability. It is signed server-side, expires at
  the reservation payment deadline and stays in the URL fragment. Its quote
  endpoint returns no customer contact details, staff notes or email history.
- Payment tables have RLS enabled and no anonymous/authenticated access. Only the
  server role can create/read/complete requests, after staff approval or signature
  validation. Staff cannot manually confirm a dummy reservation before checkout.
- Once a payment link is issued, quote, venue, dates and customer email are fixed.
  Cancel and create a replacement reservation to change them or replace an expired
  request. Rotating the signing secret invalidates existing links.
- Row locks and a unique request per reservation prevent double-recording the
  advance. Capacity/policy failures roll back the entire payment transaction.

## Automated checks

```powershell
npm test
$env:PLAYWRIGHT_CHANNEL='msedge' # Or install Playwright Chromium.
npm run test:payment-ui
npm run test:alcohol-ui
npm run test:calendar-ui
```

Unit tests mock SMTP and HTTP. Database tests execute migrations 01, 05 and 12–16
in isolated PostgreSQL (PGlite), including the real booking capacity, RLS and email
outbox triggers. Browser tests use local fixtures and block real cloud/email calls.
