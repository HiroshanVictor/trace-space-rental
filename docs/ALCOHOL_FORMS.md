# Alcohol declarations

Public inquiries, staff create/edit reservations and inquiry conversion share the existing `alcohol_planned` and `alcohol_terms_accepted` booleans. There is no new approval field. New forms start at No with acknowledgement unchecked. Choosing Yes reveals a required acknowledgement; choosing No hides and disables it and clears the previous checkbox selection. Saved values are preserved on initial editing/conversion, including historical records. Changing the interface language or the selected venue preserves the form state and conditional validation.

An acknowledgement records awareness of the conditions only. It never grants management approval. Every form states this explicitly in English, Sinhala and Tamil. The same translated validation message is used for browser validation, application validation and database errors.

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

The browser suite launches its own local server and replaces the browser config with offline demo mode. It checks Yes/No, unchecked/conditional acknowledgement, language switching, public saving, staff creation/editing, conversion, details and control alignment at desktop and mobile widths. External network calls are blocked, and any Supabase/email request fails the test.
