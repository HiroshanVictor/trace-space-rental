# Connect a real shared database + staff login (Supabase)

**These steps are optional for the quick hackathon demo**. Follow them before using this website on multiple devices or collecting live inquiries.

1. Create a Supabase project at https://supabase.com/dashboard/. Keep your database password private.
2. Go to **SQL Editor** → **New query**. Copy all SQL from `supabase/01_schema.sql` and run it as project owner. It creates `spaces`, `bookings`, `inquiries`, `blackouts`, `customers`, `org_settings`, and `staff_accounts` with RLS permissions and transactional booking guards. The script also adds illustrative venues.
3. Go to **Authentication → Users → Add user**. Enter your own staff email and choose a strong password. Confirm the email if needed. For multiple staff, create each person separately (do not share passwords).
4. Open `supabase/02_authorize_staff.sql`, replace `REPLACE_WITH_YOUR_STAFF_EMAIL@example.com` with the **real account email**, and run the script in the SQL Editor. Repeat for other approved staff accounts.
5. In Supabase go to **Project Settings → API** (exact labels may differ). Copy **Project URL** and the **publishable/anon key**. NEVER copy a **service_role / secret key** into the browser.
6. Open `config.js` and set:
   ```js
   window.SPACE_RENTAL_CONFIG = {
     supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
     supabaseAnonKey: 'YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY',
     notifyInquiryEndpoint: ''
   };
   ```
7. Serve the folder at localhost using `python -m http.server 5173`, or deploy the entire project to Netlify. Test public inquiry submission and staff login. The staff portal must ask for your credentials.
8. Sign in, test a normal booking and then attempt to book the **same meeting room** for an overlapping period. The second save must be refused. Repeat from two browsers if you can. The database also checks concurrent submissions under a per-space row lock.

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

The presentation says an inquiry should email an administrator, but allows a confirmation-only fallback during a short hackathon. The base app *always* records inquiries in Supabase. To also send email:

1. Create an account with an email service such as Resend and obtain an API key; set up a verified sender domain/address as required by the provider.
2. Deploy to Netlify using a **Git-connected repository** so the included `netlify/functions/notify-inquiry.mjs` is deployed as a serverless function.
3. In Netlify → Site configuration → Environment variables, set:
   - `RESEND_API_KEY` = your private mail provider API key;
   - `RESEND_FROM_EMAIL` = a provider-verified sender address;
   - `INQUIRY_TO_EMAIL` = the company's admin inbox.
4. Set `notifyInquiryEndpoint: '/.netlify/functions/notify-inquiry'` in `config.js`, then redeploy.
5. Test a public inquiry and verify that the database receives it and an email reaches the inbox.

Never put your mail provider secret in `config.js` or commit it to Git. **Important:** Public email endpoints can be abused. Add a server-side CAPTCHA verification / rate-limiting layer for public production traffic. Email sending is a best-effort extra; a successful stored inquiry does not guarantee email delivery.

## Payments and privacy

Payments are recorded manually (amount received and status). No actual charges are processed. Customer emails/phones are private tables under staff-only RLS. Define a privacy notice and retention policy before opening a public production service.

## Operations checklist

- [ ] Replace sample prices, capacities, venue names, amenities and rules with real information.
- [ ] Verify staff accounts and revoke departed staff using `staff_accounts` and Supabase Auth.
- [ ] Confirm your company's opening hours and cancellation policy.
- [ ] Check double-bookings from two browser sessions.
- [ ] Add CAPTCHA, backups and appropriate privacy terms before production.
