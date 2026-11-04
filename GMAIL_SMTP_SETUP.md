# Gmail SMTP testing on Netlify

The application supports `EMAIL_PROVIDER=gmail_smtp` for testing without a custom domain. The default provider remains Resend when `EMAIL_PROVIDER` is omitted or set to `resend`.

Nodemailer 10 requires Node.js 20 or later. The repository pins Netlify builds to Node.js 24 through `.nvmrc`, matching the locally tested runtime. If your Netlify site has an explicit `AWS_LAMBDA_JS_RUNTIME` override, set it to `nodejs24.x` in the Netlify UI or remove the old override so functions follow the build version. See [Netlify's runtime configuration](https://docs.netlify.com/build/functions/configuration/).

## Netlify environment variables

Enter these values in Netlify's environment-variable settings. The Google app password must only be entered there; never paste it into Git, `config.js`, a browser console, or a support message.

```dotenv
EMAIL_PROVIDER=gmail_smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=teamsdev.platform@gmail.com
SMTP_PASS=<Google app password>
EMAIL_FROM_NAME=TRACE Expert City Reservations
EMAIL_FROM_EMAIL=teamsdev.platform@gmail.com
EMAIL_REPLY_TO=teamsdev.platform@gmail.com
INQUIRY_TO_EMAIL=teamsdev.platform@gmail.com
```

Keep `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SCHEDULER_SECRET` configured for the functions. Keep `SUPABASE_URL` and the public `SUPABASE_PUBLISHABLE_KEY` (or legacy `SUPABASE_ANON_KEY`) configured for the build. Email settings must be available to Functions; also make them available to Build if relying on automatic email endpoint detection. The build writes only the existing public Supabase URL/key and two relative endpoint paths to `config.js`; it never writes SMTP settings or credentials.

Gmail mode does not require `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, or a Resend webhook. Existing Resend variables may remain set; the provider selection prevents fallback to Resend when Gmail settings are incomplete. `EMAIL_FROM_EMAIL` must match `SMTP_USER` (case-insensitive); mismatches return `not_configured` before claiming a job. The implementation requires `smtp.gmail.com:465`, `secure:true`, and validated TLS certificates. Nodemailer logging and debugging are disabled.

## Google account setup

1. Enable 2-Step Verification on the sending Google account.
2. Open [Google App Passwords](https://myaccount.google.com/apppasswords) and create an app password for this application. Use the 16 characters without the display spaces as `SMTP_PASS`, not the normal Google login password. Google may not offer app passwords for some managed or protected accounts; see [Google's requirements](https://support.google.com/accounts/answer/185833).
3. Enter the password in Netlify with the rest of the variables above. No credential is needed for automated tests.

Gmail SMTP is suitable for these application tests and remains subject to Google's sending limits and sign-in checks. SMTP acceptance does not establish inbox delivery. See [Nodemailer SMTP options](https://nodemailer.com/smtp) and [message threading fields](https://nodemailer.com/message).

## Deployment and live checks (requires your approval)

1. Run `npm ci` and `npm test` locally. Commit the source changes and `package-lock.json`. The automated suite uses mocked SMTP and in-memory MIME generation; it does not authenticate to Gmail or send email.
2. Confirm Supabase migrations 04, 05, 12, 13, and 14 have already been applied in their normal sequence. This provider change adds no new database migration, policies, or public access grants.
3. Add the Netlify variables, then deploy the Git commit to Netlify. A deployment with Gmail credentials activates the existing scheduled outbox worker, including previously failed or queued customer mail; review those jobs before enabling it. A local static server or an unrelated Vercel reference site does not run these Netlify Functions.
4. Submit one inquiry on your actual deployed site, using a different test inbox as the customer. The staff alert must arrive at `INQUIRY_TO_EMAIL`; the customer acknowledgement must arrive at the saved inquiry email with subject `TRACE Expert City | Space Reservation | TRC-...`.
5. Convert that inquiry into a pending reservation with a valid payment deadline. Then record the advance and confirm it. Check the advance-request and confirmation messages in the customer inbox; their subject stays the same. Use Gmail's Show original to inspect distinct `Message-ID` values and the parent in `In-Reply-To` and `References`.
6. Exercise cancellation, completion and a recorded refund using disposable test reservations. Each customer lifecycle event continues through `send-reservation-email`, the database outbox, and the selected provider. No staff notes or other customers' records are included in the customer templates.
7. If an email fails, inspect the private outbox's `last_error`, `attempts` and `available_at`. Gmail failures use fixed safe codes such as `smtp_auth_failed`, `smtp_timeout`, or `smtp_recipient_rejected`; credentials and raw SMTP responses are not recorded. A failure leaves the inquiry/reservation saved. The existing worker retries eligible customer jobs every five minutes with database backoff and claims. Staff alerts retain their existing inquiry claim and staff retry action.

## Threading, retries and switching providers

For SMTP, each outbox job receives a deterministic RFC Message-ID derived from its existing idempotency key. Nodemailer supplies that ID immediately when Gmail accepts the message; the existing result RPC stores it and advances the conversation, so new SMTP follow-ups never need a Resend lookup or event. A direct staff booking may start its own SMTP conversation when it has no earlier accepted message. References always come from the same conversation. Inbox applications control whether they visually group messages.

The historical column `provider_email_id` stores a separate `gmail_smtp:` transport token for SMTP messages; this token is not a Gmail server queue ID and is never used for email thread headers. The RFC ID is stored in `rfc_message_id` as before. Gmail messages stay `accepted` in delivery history; this change does not add Gmail delivery/bounce webhooks or inbound reply processing. Replies go to `EMAIL_REPLY_TO`.

Database claims, backoff, and stale-worker recovery remain in place. Retries reuse the same Message-ID, but SMTP does **not** guarantee exactly-once delivery. A network interruption after Gmail accepts a message, or a failure to save its result in Supabase, can produce a duplicate on retry. Neither `nothing_to_send` nor `awaiting_thread` is reported as sent.

Existing accepted Resend emails keep their existing history and are not automatically resent through SMTP. If a historical Resend message was accepted without its RFC Message-ID, its follow-ups stay `awaiting_thread` until the genuine ID is recovered through the existing Resend lookup/webhook or reconciled from the original message. The sender never substitutes a provider API ID or invents a parent. Test the new provider with a fresh inquiry to check the complete SMTP thread.

`notify-booking` is now a compatibility alias for the main reservation sender, including its staff authorization and database outbox. It no longer runs an independent one-off customer email path. Public inquiry acknowledgement, staff-only booking sends, and scheduler authorization retain their existing boundaries; email tables remain protected by RLS.
