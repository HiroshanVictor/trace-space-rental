# Update your EXISTING Netlify Space Rental website to V2

Your previous Netlify website and Supabase database can be kept. This update does not require a new database or a new Netlify site.

## 1. Update Supabase first (required for online bookings)

1. Log in to the **same Supabase project** used by your current website.
2. In **SQL Editor → New query**, paste the entire file `supabase/03_public_availability.sql` and click **Run**.
3. This adds a *read-only, privacy-restricted* public calendar function. It does not delete or replace your bookings, customers or existing staff accounts.
4. Keep Row Level Security enabled; do not give anonymous users access to private tables.

If you have never connected Supabase and are using browser demo mode, skip this step; local mode is viewable only on that visitor's own browser and does **not** show your company's real reservations to other visitors.

## 2. Carry over your existing configuration

1. Extract this V2 ZIP into a **new folder**. Do **not** erase your old project before copying its configuration.
2. From your existing project, copy the real `supabaseUrl` and `supabaseAnonKey` values in `config.js` into the new V2 `config.js`.
3. If you configured an inquiry email function before, also copy `notifyInquiryEndpoint`.
4. **NEVER** use a Supabase service-role or secret key in this public file.

## 3. Run locally

Open a PowerShell terminal in the new folder containing `index.html` and `package.json`:

```powershell
npm run dev
```

Go to `http://localhost:5173/#availability` and choose a date with an existing reservation. Your public calendar should show the occupied venue and exact time, without any customer names.

## 4. Deploy to the SAME Netlify website

1. Open https://app.netlify.com and select your **existing** Space Rental site.
2. Go to **Deploys** and find the manual deploy / drag-and-drop upload area.
3. Drag the **extracted inner project folder** (containing `index.html`, `styles.css`, `config.js`, `src/`, `netlify.toml`) there.
4. **Do not run `npm run build`**. The project is plain HTML/CSS/JS and has no build step.
5. Open your existing site's URL followed by `/#availability` (example `https://YOUR-SITE.netlify.app/#availability`).
6. Test in an incognito browser window, so you are not signed in as staff.

If the public calendar displays a database function error, run step 1 above on the same Supabase project your published `config.js` points to.

## What the public sees

- Space/venue names, date, booked start/end time, unavailable maintenance periods, number of desks reserved.
- Booking segments marked Free, Booked, Partly booked, Unavailable.
- Next / previous day, date picker, venue selector, and Send inquiry.
- No names, phone numbers, emails, amounts, staff notes, or private maintenance reasons.
- Public inquiries are **not** auto-approved bookings. Staff must create bookings as before.
