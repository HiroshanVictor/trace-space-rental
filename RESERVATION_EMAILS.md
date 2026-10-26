# Reservation email conversations

Run `supabase/12_reservation_email_conversations.sql` after the existing database migrations, then deploy the Netlify functions. The migration generates one non-sensitive `TRC-…` reference when a public inquiry is saved. It creates one conversation whose subject remains:

`TRACE Expert City | Space Reservation | {reference}`

Each send is an outbox record with a stable Resend idempotency key. A provider email ID and the RFC `Message-ID` are stored separately. Follow-up messages do not send until the actual parent RFC `Message-ID` is available; their `In-Reply-To` and `References` headers use that ID. This prevents a new email from being mistaken for part of another customer’s conversation.

Set these **server-only** Netlify variables. Do not put any of them in `config.js`.

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Server-side outbox and booking access |
| `RESEND_API_KEY` | Resend API authentication |
| `RESEND_FROM_EMAIL` | A verified sender address only |
| `RESEND_REPLY_TO_EMAIL` | Monitored TRACE front-desk mailbox |
| `RESEND_WEBHOOK_SECRET` | Signature verification for `/.netlify/functions/resend-webhook` |
| `SCHEDULER_SECRET` | Protects the scheduled worker's internal hand-off to the email sender |
| `INQUIRY_TO_EMAIL` | Existing staff inquiry-alert recipient |

Configure the Resend webhook endpoint for delivery events and, if later approved, inbound email events. The webhook verifies the signed payload, deduplicates provider events, and updates accepted/delivered/bounced/complained states. Inbound replies are intentionally only logged: replies go to the monitored `Reply-To` mailbox. Do not present the app as processing inbound email until an approved inbound workflow and mailbox ownership are configured.

The scheduled `expire-payment-holds` function runs every 15 minutes. It is disabled unless `org_settings.advance_hold_enabled` is enabled by management. It marks a 72-hour (configurable) unpaid hold for staff review and sends a thread follow-up. It does not cancel the booking, charge a fee, or issue a refund automatically.

The payment deadline must be set by staff on a pending booking. `payment_instructions` belongs in `org_settings` and is included only when a payment request is sent. Store payment references and staff-recorded refunds on the booking; the system does not create a payment, refund, or cancellation fee.

Before enabling real delivery, use a staging verified sender and run this manual check with Gmail and Outlook:

1. Submit an inquiry; verify the customer sees the stable subject and a `TRC-…` reference.
2. Create the linked booking with a payment deadline, then send the advance request; verify it appears in the same thread.
3. Record the advance and confirm the booking; verify the receipt/reference follow-up is threaded.
4. Test delivery and bounce states with provider webhooks, including a replayed event.
5. Test a cancellation and a staff-recorded refund. Confirm no fee or refund is calculated by the application.
6. Test a different customer and confirm no Message-ID appears in their headers or thread.

The supplied automated tests never contact Resend or a real inbox. Do not send live emails until the sender, Reply-To mailbox, webhook secret, and staging checks are configured.
