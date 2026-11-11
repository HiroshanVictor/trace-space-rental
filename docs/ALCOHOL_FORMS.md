# Alcohol declarations

The customer booking/inquiry form collects the existing `alcohol_planned` and `alcohol_terms_accepted` booleans. There is no new approval field. New customer forms start at No with acknowledgement unchecked. Choosing Yes reveals a required acknowledgement; choosing No hides and disables it and clears the previous checkbox selection. Changing the interface language or the selected venue preserves the form state and conditional validation.

Staff create/edit and inquiry conversion forms do not show an editable alcohol option. Conversion copies both saved customer values, and editing preserves the reservation's saved values. A new staff-created reservation defaults both values to false without claiming a customer acknowledgement. Staff can view the declaration and acknowledgement in inquiry and reservation details.

An acknowledgement records awareness of the conditions only. It never grants management approval. The customer form states this explicitly in English, Sinhala and Tamil. The same translated validation message is used for browser validation, application validation and database errors.

## Migration

Apply `supabase/15_alcohol_acknowledgement.sql` in Supabase SQL Editor after migration 05 and the migrations already installed in that project. It adds insert/update triggers on the existing alcohol fields in `inquiries` and `bookings`. It does not rewrite existing records, add columns, or alter RLS or grants. Direct SQL/API attempts to save Yes without acknowledgement fail with SQLSTATE `23514`. Updates to unrelated fields on historical records continue normally.

No production migration has been applied by the implementation or automated tests.

## Tests

```powershell
npm ci
npm test
```

This includes an isolated in-memory PostgreSQL database (PGlite). The actual migration is run twice to check idempotence, old-record preservation, anonymous access boundaries, conditional validation, editing and inquiry conversion. No Supabase connection or production database is used.

For the actual desktop/mobile forms:

```powershell
npx playwright install chromium
npm run test:alcohol-ui
```

An existing Microsoft Edge installation can be used instead of downloading Chromium:

```powershell
$env:PLAYWRIGHT_CHANNEL='msedge'
npm run test:alcohol-ui
```

The browser suite launches its own local server and replaces the browser config with offline demo mode. It checks customer Yes/No choices, unchecked/conditional acknowledgement, language switching, public saving and control alignment at desktop and mobile widths. It also checks the absence of alcohol inputs in staff forms, preservation through conversion/editing, staff creation defaults and read-only details. External network calls are blocked, and any Supabase/email request fails the test.
