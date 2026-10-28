# Connect a real shared database + staff login (Supabase)

**These steps are optional for the quick hackathon demo**. Follow them before using this website on multiple devices or collecting live inquiries.

1. Create a Supabase project at https://supabase.com/dashboard/. Keep your database password private.
2. Go to **SQL Editor** → **New query**. Run the *contents* of `supabase/01_schema.sql`, `supabase/04_inquiry_notifications.sql`, `supabase/05_trace_booking_policy.sql`, `supabase/06_trace_spaces.sql`, `supabase/07_trace_space_images.sql`, `supabase/08_trace_space_images_distinct.sql`, `supabase/09_local_trace_space_images.sql`, `supabase/10_match_trace_venue_images.sql`, and `supabase/11_public_space_activity.sql`, in that order, as project owner. Paste SQL code, not a filename. The main schema creates the tables and RLS; the later scripts add notification tracking, TRACE booking rules, venue records, matched local images, and privacy-safe homepage booking aggregates.
3. Go to **Authentication → Users → Add user**. Enter your own staff email and choose a strong password. Confirm the email if needed. For multiple staff, create each person separately (do not share passwords).
4. Open `supabase/02_authorize_staff.sql`, replace `REPLACE_WITH_YOUR_STAFF_EMAIL@example.com` with the **real account email**, and run the script in the SQL Editor. Repeat for other approved staff accounts.
5. In Supabase go to **Project Settings → API** (exact labels may differ). Copy **Project URL** and the **publishable/anon key**. NEVER copy a **service_role / secret key** into the browser.
6. Open `config.js` and set:
   ```js
   window.SPACE_RENTAL_CONFIG = {
     supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
     supabaseAnonKey: 'YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY',
     notifyInquiryEndpoint: '/.netlify/functions/notify-inquiry',
     reservationEmailEndpoint: '/.netlify/functions/send-reservation-email'
   };
   ```
7. Serve the folder at localhost using `python -m http.server 5173`, or deploy the entire project to Netlify. Test public inquiry submission and staff login. The staff portal must ask for your credentials.
8. Sign in, test a normal booking and then attempt to book the **same meeting room** for an overlapping period. The second save must be refused. Repeat from two browsers if you can. The database also checks concurrent submissions under a per-space row lock.

For the existing `t2t group1` project, first check Table Editor for `spaces`, `bookings`, `inquiries` and `staff_accounts`. If present, keep its existing data and run only missing migrations in order: `03_public_availability.sql` (if calendar RPC is missing), `04_inquiry_notifications.sql`, `05_trace_booking_policy.sql`, optional `06_trace_spaces.sql`, and `11_public_space_activity.sql`. If migration 11 was installed previously, run its updated contents again to add the public monthly and yearly booking-count aggregate; it is safe to rerun. The venue script adds venues only when names are missing; it does not replace old venues or bookings. Archive old sample venues through the staff portal after reviewing them. Redeploy Netlify after running migrations. The public inquiry and staff booking forms require migration 05; homepage booking filters and totals require migration 11.

## Configure Netlify from environment variables

Git-connected Netlify deployments now run `node scripts/configure.mjs` automatically. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in Netlify's build environment. A legacy public JWT is accepted under `SUPABASE_ANON_KEY` instead. When the server email settings are present, the build writes the staff-alert and customer-acknowledgement paths to `config.js`; service-role keys and email secrets are excluded. Partial configuration, remote HTTP project URLs, and server keys used as public keys fail the build with a generic error that does not print the key.

Existing valid manual configuration is preserved when no environment overrides are supplied. With neither manual values nor environment settings, the app stays in browser-local demo mode. `npm run configure` runs the same generator locally using the current process environment; `.env.example` is a reference, and `.env` files are not automatically loaded. Do not commit real secret files.

## Existing Netlify + Supabase sites: update to the public availability calendar

**Do this if your first version already works online; do not recreate or reset your database.**

1. In the original deployed application's `config.js`, copy your **Supabase URL** and **publishable/anon key**. Do not share a secret/service-role key. The new ZIP intentionally leaves configuration blank.
2. In the **same existing Supabase project**, open **SQL Editor → New query**. Copy **all** of `supabase/03_public_availability.sql` from the new ZIP, paste and run it **once**. It is safe to rerun, and does not remove or overwrite your existing reservations, users or venues.
3. Extract the new ZIP to a **new folder**. Paste your own public Supabase config values into the new `config.js` (keep your optional email endpoint only if you set it up before).
4. Test locally: `npm run dev`. Open `http://localhost:5173/#availability` in a private browser window, switch to a day with a confirmed booking and check the time and venue. No staff login should be needed.
5. On Netlify, open your existing site → **Deploys** → drag and drop the **updated inner project folder** containing `index.html`, `config.js`, `src`, `styles.css` and `netlify.toml` into the manual deploy box. Do not upload just the HTML, and do not upload `node_modules` (none needed). There is **no `npm run build`**.
6. Open `https://YOUR-EXISTING-SITE.netlify.app/#availability` in a private window, and verify reservations appear. The site address should remain unchanged when you redeploy the existing site.

**Privacy and reliability:** anonymous public access is only through `public_space_schedule(p_from, p_to)`, which returns venue UUID, booked start/end, `booking` or `blocked`, and desk quantities. The function accepts a maximum 36-hour window; the frontend requests one local day. Existing RLS rules must remain enabled; **never grant public SELECT on the `bookings` or `blackouts` tables**. A failed API call shows an error message, not a misleading free calendar. Browsing is read-only and does not hold a venue; staff still confirm inquiries. Data refreshes on each selected day and Refresh click.

## Row-level security

- Anonymous visitors can read **active spaces**, public business details, and a privacy-restricted schedule function listing occupied venue/time windows only. They can **insert** a new inquiry, but cannot read the inquiries table or see anyone else's inquiry.
- Only authenticated **allowlisted staff** can edit spaces, bookings, clients, maintenance or company profile.
- Authenticated non-staff users cannot access the company workspace.
- Deleting spaces referenced by bookings, maintenance or inquiries is refused. Archive those spaces instead.
- The booking conflict rule is enforced in the database, not just in the browser. Use the supplied trigger and keep RLS enabled.

## Optional email delivery for inquiries

The presentation says an inquiry should email an administrator, but the speaker notes allow a confirmation-only fallback during a short hackathon. Cloud-mode inquiries are stored before notification is attempted. To enable email:

1. Create an account with an email service such as Resend and obtain an API key; set up a verified sender domain/address as required by the provider.
2. Deploy to Netlify using a **Git-connected repository** so the included `netlify/functions/notify-inquiry.mjs` is deployed as a serverless function.
3. Run `supabase/04_inquiry_notifications.sql` in the existing project. In Netlify → Site configuration → Environment variables, set:
   - `SUPABASE_URL` = the shared project's URL (available to the build and functions);
   - `SUPABASE_PUBLISHABLE_KEY` = the public publishable key (available to the build);
   - `SUPABASE_SERVICE_ROLE_KEY` = the private legacy service-role JWT (functions only; never in browser code);
   - `RESEND_API_KEY` = your private mail provider API key;
   - `RESEND_FROM_EMAIL` = a provider-verified sender address;
   - `INQUIRY_TO_EMAIL` = the company's admin inbox.
4. Redeploy. The build enables `/.netlify/functions/notify-inquiry` for the staff alert and `/.netlify/functions/send-reservation-email` for the customer acknowledgement when all email settings are present. You can set the two paths manually in `config.js`, or use `INQUIRY_NOTIFY_ENDPOINT` and `RESERVATION_EMAIL_ENDPOINT` as explicit build overrides.
5. Test a public inquiry: verify the front desk receives the internal inquiry details at `INQUIRY_TO_EMAIL`, and the customer email receives the `TRACE Expert City | Space Reservation | TRC-…` acknowledgement. If either email fails, confirm the inquiry still appears in the staff workspace and retry it from its details view.

The endpoint accepts an inquiry UUID, reads its canonical saved content server-side, and sends it only to the configured staff inbox. Private inquiry contents are never returned to visitors. A database claim limits retries for the same inquiry to once per minute and skips records already marked sent. Resend receives the same idempotency key for retries; its protection lasts 24 hours ([provider documentation](https://resend.com/docs/dashboard/emails/idempotency-keys)). A provider acceptance is recorded as sent; inbox delivery and subsequent bounces are not tracked.

In **Inquiries → Details**, staff can see email status, attempts and the last attempt, then retry a pending or failed notification. A retry does not create another inquiry. Visitors see that the inquiry is saved even if email fails, times out or is unconfigured. Browser responses, provider responses and database errors are checked separately. If a browser closes before notification is requested, the saved inquiry remains pending for staff to retry; there is no scheduled background sender.

Never put the service-role key or mail provider secret in `config.js` or commit either to Git. For public production traffic, protect new inquiry creation with appropriate abuse controls. Stored inquiries remain the authoritative request record; an accepted email does not guarantee inbox delivery.

The same email environment also enables `netlify/functions/notify-booking.mjs`. Staff create a pending booking or record an advance and confirm it; the app then asks the function to email the saved booking to the customer immediately. The email reads the saved record server-side, requires an authenticated allowlisted staff token, and explains whether the reservation is still awaiting advance payment. Failed customer emails remain visible on the booking details screen for staff retry. Provider acceptance is recorded; inbox delivery and bounces still need an inbox check. Run migration 05 before testing customer booking email.

## Verify the shared workflow against staging

Apply the main schema and notification migration, and create an allowlisted **staging** staff account. In PowerShell, set these process environment variables without committing their values:

```powershell
$env:SUPABASE_URL = 'https://YOUR-STAGING-PROJECT.supabase.co'
$env:SUPABASE_PUBLISHABLE_KEY = 'YOUR_PUBLIC_KEY'
$env:SUPABASE_TEST_STAFF_EMAIL = 'YOUR_STAGING_STAFF_EMAIL'
$env:SUPABASE_TEST_STAFF_PASSWORD = 'YOUR_STAGING_STAFF_PASSWORD'
$env:CLOUD_CHECK_ALLOW_WRITES = '1'
npm run check:cloud
```

The check creates a uniquely named temporary venue, makes two simultaneous conflicting reservations, and requires exactly one to succeed. It also checks that an immediate next booking fails the turnover gap and one starting after the gap succeeds. Anonymous inquiry submission, staff visibility, private-record protection, the server-only notification claim, and the privacy-safe public schedule are checked too. It deletes only its own generated records in a `finally` block. If cleanup fails, it reports the exact test record IDs for removal. It does not invoke email delivery.

Without the staging settings and explicit write flag, the check exits before making requests. Live email delivery still needs one deliberate end-to-end submission and inbox verification after deployment.

## Payments and privacy

## Reservation email conversations

For threaded customer reservation emails, run `supabase/12_reservation_email_conversations.sql` after migration 11 and deploy the new Netlify functions. Then follow [RESERVATION_EMAILS.md](RESERVATION_EMAILS.md) to configure the server-only Resend sender, monitored Reply-To mailbox, webhook secret and scheduled payment-hold review. The workflow is disabled until those settings are present; it does not send a real email during setup.

Payments are recorded manually (amount received and status). No actual charges are processed. Customer emails/phones are private tables under staff-only RLS. Define a privacy notice and retention policy before opening a public production service.

## Operations checklist

- [ ] Confirm demo price estimates, Bay 07 capacity/equipment, TRACE Idea Studio hotseat count, venue conditions, payment deadline and cancellation penalties with management.
- [ ] Verify staff accounts and revoke departed staff using `staff_accounts` and Supabase Auth.
- [ ] Confirm your company's opening hours and cancellation policy.
- [ ] Check double-bookings from two browser sessions.
- [ ] Add CAPTCHA, backups and appropriate privacy terms before production.
