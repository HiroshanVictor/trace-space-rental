# TRACE EXPERT CITY — Space Rental & Reservation Manager
### Complete hackathon application | Public website + Company admin portal

A ready-to-run app for the **T2T IT General Batch Space Rental Hackathon**. Based on the PowerPoint: replace Excel, show which spaces are free, block double-bookings, store customer records, and let public visitors send **inquiries**, not actual reservations.

## Start in 2 minutes (no paid services)

1. Extract the ZIP to a normal folder.
2. Open the folder in VS Code.
3. Open a terminal **inside that folder** and run:
   ```powershell
   npm run dev
   ```
   This uses the included Node.js server, so **no `npm install` is needed**. You can alternatively run `python -m http.server 5173`, or `py -m http.server 5173` on Windows.
4. Open **http://localhost:5173** in a browser.
5. Select **Staff management → Open demo dashboard**.

No `npm install` is required. This project is built with native HTML5, CSS3 and JavaScript ES modules. No framework dependencies, build tools or paid hosting are required to run the demo.

### Languages

The interface supports **English (default), සිංහල (Sinhala), and தமிழ் (Tamil)**. Use the language selector in the public header, staff dashboard, sign-in page, or dialogs. The selection is remembered in this browser and applies to navigation, forms, calendars, dates, validation, and notifications. Switching languages preserves unfinished form entries.

Translations are bundled locally in `src/translations.js`; no translation service or API key is needed. Original sample venue names and descriptions are translated for display. Staff-entered content and customer details remain as entered, and CSV exports retain the original records. Add or edit interface translations using the English message key and its `[Sinhala, Tamil]` pair. `npm test` checks translation coverage and parameters.

### What is included

| Public visitor | Company staff |
|---|---|
| Beautiful marketing homepage | Admin overview / KPI dashboard |
| Browse active spaces with photos and rates | Add new spaces (meeting rooms, auditorium, desk zones) |
| Public **Availability Calendar**: choose date and venue, see booked times, capacity and maintenance blocks | Edit space amenities, images, capacities, conditions and all rates |
| Filter spaces, send a date/time inquiry with name, email, phone & message | Archive / restore spaces; delete unused spaces |
| Inquiry acknowledgement (not an instant booking) | Availability calendar and maintenance blocks |
| No visitor login or online payment required | Create, view, edit, cancel and delete reservations |
| | Strict overlap rejection + multi-desk seat counts |
| | Customer contact directory, contact details and notes |
| | Reservation purposes, attendee counts and requirements |
| | Automatic pricing based on duration/unit, discount and payment tracking |
| | Pending / confirmed / completed / cancelled statuses |
| | View / update inquiries; convert an inquiry to a booking |
| | Export bookings, spaces, contacts and inquiries to CSV |
| | Dashboard reports and configurable company contact details |
| Inquiry stays saved when email fails | Inquiry email status, attempt count and retry without a duplicate inquiry |

**New in v2 — Public Availability Calendar:** Visitors can open **Availability calendar** in the top navigation or use `https://YOUR-SITE.netlify.app/#availability` without a staff account. The page shows venue names, each occupied time range, maintenance/unavailability, and desk quantities. It has next/previous date buttons, a date picker, a venue filter, daily hour-by-hour coloured overview, exact booking times and an inquiry button prefilled with the selected date. **No customer names, emails, phone numbers, booking references, financial data, notes or private maintenance reasons are shown.** All booking statuses except cancelled reserve their times; inquiries do not. It refreshes when changing dates or pressing Refresh (not a constant live stream).

The homepage **Popular** and **Latest bookings** filters and booking overview use safe aggregates fetched from Supabase. Apply the updated `supabase/11_public_space_activity.sql` to an existing database before deploying; anonymous visitors receive per-space counts, latest booking timestamps, and overall/monthly/yearly totals only, never customer details or raw booking records. Total and period counts include pending, confirmed and completed bookings, exclude cancelled bookings, and group monthly/yearly totals by the booking creation date. Without Supabase, the page uses local demo bookings.

For **existing Supabase projects**, you **must run** `supabase/03_public_availability.sql` once in the Supabase SQL Editor **before** publishing this updated version. The function publishes only a safe, minimal schedule without loosening private table policies. For a brand new database, `supabase/01_schema.sql` already contains it. Instructions: `SETUP_SUPABASE.md`.

**Reservation rule:** Room bookings require one hour between different customers, and event spaces require four hours. An extension for the same customer is a separate linked booking that may start immediately when the previous booking ends. Meeting spaces have a one-hour minimum, event spaces four hours, and co-working seats one day. Pending, confirmed and completed bookings occupy slots; cancelled bookings do not. Desks use an exact peak-overlap count.

**Pricing:** Rates are estimated demo amounts, not official TRACE prices. Billing supports hours, days, 7-day weeks and 30-day periods. The demo requires 50% advance for event spaces and a provisional 25% for other spaces before staff can mark a booking confirmed. Management must confirm the final amount, payment deadline and cancellation fee.

The starter catalog now uses published TRACE venue names and capacities from [TRACE Spaces](https://tracesrilanka.lk/trace-spaces). Bay 07 capacity, hotseat count, amenities not stated by TRACE, all prices and the stock images are illustrative. In an existing local demo, use **Settings → Reset demo** to load the new starter catalog; this replaces browser-local edits. For an existing shared Supabase database, run `supabase/05_trace_booking_policy.sql` and then `supabase/06_trace_spaces.sql` in SQL Editor. The venue script adds missing records and retains existing bookings and spaces; archive old sample venues in the staff portal if you no longer want them listed.

Public inquiries now collect event nature, outside suppliers and alcohol plans. TRACE management reviews these before making a booking. Staff can record multiple locations for one customer, create a separate extension, record an advance, and require both a phone call and official email before cancellation. A no-show advance, refunds, overtime and cancellation penalties remain management decisions recorded manually; the app does not move money.

## Demo data and what it means

If `config.js` has empty Supabase values, the app is in **local demo mode**:
- All CRUD operations, availability checks, sample bookings, manual payments, calendar and CSV export work locally.
- Changes are saved to the **same browser's localStorage**. They do NOT sync to other phones, staff devices or the website visitors.
- There is **no secure login** for this mode; its "Open demo dashboard" is designed for showcasing only.
- Emails are **not sent** in this mode; demo public inquiries are saved locally and visible in the same browser.
- Use Settings → Reset demo to restore starter records.

**Do not use demo mode for real paid bookings or a live multi-user business.** Instead configure Supabase (see `SETUP_SUPABASE.md`). Supabase mode includes real staff authentication, DB-backed data, RLS and atomic database booking checks.

## Free Netlify publishing (public demo)

**Easiest static demo:** in Netlify, create a new site via manual deployment and upload the **extracted project folder** (the folder that contains `index.html`, `styles.css`, `config.js`, and `src/`). Netlify will serve the website without a build step. Keep all folders and files together.

**Important:** A public Netlify deployment does not magically create a shared database. If `config.js` is blank, everyone has their own separate demo dataset. Use Supabase before accepting real public inquiries / reservations.

**Online real-data version:** Existing users must run the new `supabase/03_public_availability.sql` SQL script. Keep your existing Supabase URL and publishable key when replacing `config.js` in the new ZIP (they are not included in the download). Complete `SETUP_SUPABASE.md`, then deploy the exact same folder through Netlify. All devices with that configuration share the same database. Email is an optional extra requiring provider credentials and a Netlify Functions deployment (Git-based deployment is recommended for the function).

## Project map

```
package.json                  npm run dev / npm test scripts (no dependencies)
server.mjs                    Built-in Node.js development HTTP server
index.html                    Main entry page
styles.css                    Responsive corporate UI
config.js                     Non-secret Supabase URL and publishable key
src/app.js                    Public pages, admin views, forms and interactions
src/engine.js                 Conflict prevention, rates, validation and CSV utility
src/data.js                   Sample data for local demo
src/store.js                  Local + Supabase storage adapters
src/publicAvailability.js     Privacy-safe schedule projection and date utilities
supabase/01_schema.sql        Tables, RLS rules and atomic DB booking constraints
supabase/02_authorize_staff.sql Staff allowlisting sample
supabase/03_public_availability.sql Additional public schedule RPC for existing online projects
netlify/functions/notify-inquiry.mjs Optional email function via Resend
netlify/functions/notify-booking.mjs Optional customer booking email via Resend
supabase/04_inquiry_notifications.sql Private email status and server-only retry claim
supabase/05_trace_booking_policy.sql Event details, advances, gaps, extensions, cancellation evidence and email status
supabase/06_trace_spaces.sql Additive real TRACE venue catalog with illustrative rates
src/inquiryNotifications.js   Notification response and timeout handling
scripts/configure.mjs        Generate public config from deployment environment
scripts/check-cloud.mjs      Opt-in staging concurrency and privacy check
BACKLOG.md                   User stories, priorities and hand-in checklist
SETUP_SUPABASE.md             Full step-by-step online setup
HACKATHON_DEMO_SCRIPT.md      Suggested judging demo
TEST_CASES.md                 Required manual verification checklist
```

## Scope boundaries

The original hackathon brief requires an admin booking system first and makes inquiries / extras secondary. The delivered app expands that scope while **keeping public visitors inquiry-only**, as requested by the slides. The "Payments" section is **manual payment recording**; it is not a payment gateway. CSV reports are exports, not a government tax invoice or accounting system. Online email sending is optional and is **not active by default**.

For deployment as a real commercial product, add monitoring, backups, CAPTCHA and API abuse protection, audit logging, tests against a staging database and appropriate privacy / data retention policies.

## Remaining setup for shared use

The core admin features and inquiry workflow are implemented. To activate them across devices, connect a Supabase project and allowlist staff accounts. Run the main schema and `supabase/04_inquiry_notifications.sql`; configure the public project values and server-only email credentials using `SETUP_SUPABASE.md` and `.env.example`.

Git-connected Netlify deployments generate public configuration from environment variables. `npm test` checks local rules, translations, notification failures and configuration handling. `npm run check:cloud` verifies concurrent bookings and private-record access against an explicitly configured staging project, with temporary records cleaned up afterward. Actual inbox delivery and the live hackathon demonstration must still be verified.
