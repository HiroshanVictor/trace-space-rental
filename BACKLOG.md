# Space rental hackathon backlog

Source: Space Rental Hackathon deck, slides 3–8 and 11, including speaker notes.
“Implemented” means code and local tests exist. Live cloud checks are separate.

| ID | Priority | User story | Acceptance criteria | Status |
|---|---|---|---|---|
| B01 | Must | As staff, I want to see every rentable space so I can choose the right venue. | Rooms, auditorium and desks show capacity, amenities and rates; auditorium conditions are editable. | Implemented |
| B02 | Must | As staff, I want availability by date so I can answer customer requests quickly. | Calendar displays reservations and maintenance by venue and time. | Implemented |
| B03 | Must | As staff, I want to record a booking so the customer, venue and dates stay together. | Required contact and date fields are validated; saved bookings persist. | Implemented |
| B04 | Must | As staff, I want conflicting bookings rejected so customers never share an exclusive venue accidentally. | Overlaps reject; adjacent windows accept; edits ignore their own reservation; cancelled bookings release capacity. | Implemented locally; database concurrency needs live verification |
| B05 | Should | As staff, I want one searchable booking list so I can find who booked what and for how long. | List includes customer, venue, dates, status and payment details; search and filters work. | Implemented |
| B06 | Should | As a visitor, I want to request a space without an account so staff can follow up. | Name, contacts, space, dates and message are captured; submission does not reserve a timeslot. | Implemented; shared storage needs project configuration |
| B07 | Should | As staff, I want inquiry emails so requests are noticed promptly. | Only saved inquiries are emailed to the configured inbox; results are tracked; staff can retry without duplicating the inquiry. | Implemented; migration, credentials and live delivery verification required |
| B08 | Could | As staff, I want desk bookings by day, week or month so pricing matches the booking duration. | Inventory uses peak simultaneous occupancy; day/week/30-day rates are supported. | Implemented |
| B09 | Could | As staff, I want a calculated booking total and payment record so balances are easy to track. | Duration and desk count determine price; discounts, partial payments and balance are retained. | Implemented |
| B10 | Could | As a visitor or staff member, I want English, Sinhala or Tamil so I can use the interface comfortably. | Language choice persists; dates and interface messages translate; draft forms survive switching. | Implemented |
| B11 | Must for shared use | As staff, I want one shared database so inquiries and bookings appear across devices. | Public insert works; private records remain staff-only; concurrent conflicting bookings allow exactly one winner. | Integration provided; live project configuration and verification required |

## Hand-in checks

- [x] Repository and working admin app.
- [x] User-story backlog with must-haves first.
- [x] Local overlap, pricing and public-schedule tests.
- [x] Demonstration guide: `HACKATHON_DEMO_SCRIPT.md`.
- [ ] Run `supabase/04_inquiry_notifications.sql` after the main schema.
- [ ] Configure shared database and staff accounts.
- [ ] Run `npm run check:cloud` against a staging project.
- [ ] Verify one inquiry notification reaches the actual inbox.
- [ ] Confirm commits from every actual team member; do not manufacture commit history.
- [ ] Deliver the live demo, including a rejected overlap.
