# Functional verification

## Core booking checks

- [ ] Meeting Room A: confirmed 10:00–12:00. Create 11:00–13:00 → must reject.
- [ ] Same room: book 12:00–13:00 → must accept (end/start boundary).
- [ ] Same time in another room → must accept.
- [ ] Cancel 10:00–12:00 reservation, book 11:00–13:00 → should accept.
- [ ] Edit an existing reservation to clash with another → must reject.
- [ ] Archive a space → no new booking; existing booking remains visible.
- [ ] Maintenance 15:00–17:00 → booking 16:00–18:00 must reject.
- [ ] Create a maintenance period overlapping an active reservation → must reject.
- [ ] Desk zone inventory 14: book 10 desks, overlapping book 4 → accept; overlapping book 1 more → reject.
- [ ] Desk durations can be billed daily, weekly or per 30 days.

## CRUD and public website

- [ ] Add, edit, archive, restore and remove an unreferenced space.
- [ ] Attempt to remove a space that has historical bookings → reject and recommend archiving.
- [ ] Add/edit customer; customer dropdown auto-populates contact fields.
- [ ] Record partial payment, edit and complete reservation.
- [ ] Submit inquiry via public form → visible to admin. Visitor cannot confirm booking directly.
- [ ] Mark inquiry Contacted then convert to reservation.
- [ ] Edit company phone, email and hours.
- [ ] Download all four CSV exports.
- [ ] Resize to narrow mobile viewport; navigation must stay accessible.

## Production / cloud checks (only after Supabase setup)

- [ ] Anonymous visitors cannot list bookings, customers or inquiries.
- [ ] Staff credentials log in; random authenticated users are denied.
- [ ] Two different browsers share changes when Supabase is configured.
- [ ] Simultaneous overlapping bookings: database allows one and rejects the other.
- [ ] Anon inquiry insert works without a select policy.
- [ ] Optional email function works only when configured with private provider credentials.

## Public availability calendar (v2)

1. Open `/#availability` while **signed out**. See active venue names and an hour-by-hour view for the chosen day.
2. Press Next day; on a day with a confirmed reservation, the venue has red **Booked** cells and an exact booked time range. A private customer name or booking reference must **not** appear.
3. Select the desk zone; a reservation for 3 of 14 desks shows **Some desks left**, not all desks blocked.
4. Create a maintenance block from staff admin; revisit the public calendar for that date. See **Unavailable** without the private reason.
5. Cancel a reservation in staff admin; refresh the public date. The cancelled reservation must not appear.
6. Use venue filter, date selector, previous-day and Today controls.
7. From a venue row click **Send inquiry**; the inquiry form should choose that venue and date, without reserving it yet.
8. For Supabase deployments, use an incognito browser. Public schedule must load without staff authentication. Verify public browser cannot query private `bookings`, `blackouts` or `customers` tables via the REST API.
9. If the public RPC was not installed, the public calendar must show an informative error — not empty green availability.
10. Confirm the calendar responds on mobile and the admin pages still work.
