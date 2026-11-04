Staff calendar verification
===========================

Open **Staff → Availability Calendar** and select a date with a saved reservation.
The calendar reads that day's reservations and maintenance blocks from the existing
staff-protected tables. Public inquiries do not occupy a space until converted.
No database migration or new environment variable is required for this calendar change.

- Use the previous/next day, Today, date input and space selector to browse.
- Click a reservation to view details or a maintenance block to edit it.
- Click an empty hour to start a reservation for that space and time. Initial duration
  follows the venue's minimum; existing capacity, turnover and booking rules still
  apply when saving.
- Use **Refresh schedule** to fetch changes made by other staff. Loading failures
  show an error instead of claiming that all spaces are available.
- The normal timeline is 08:00–20:00. Early, late and overnight events automatically
  expand it to the full selected day. Times use the browser's timezone, shown above
  the timeline. Overlapping events use separate tracks.
- On a phone, scroll horizontally inside the timeline to reach other hours.

Run `npm test` and `npm run test:calendar-ui`. If Playwright's bundled browser is not
installed, on Windows with Edge use `$env:PLAYWRIGHT_CHANNEL='msedge'` first.
The browser test uses isolated local fixtures and blocks cloud/email requests.
It covers date and venue selection, early bookings, overlapping desk reservations,
details, maintenance editing, creating a reservation from the grid, refreshing,
and mobile overflow. Unit tests cover day boundaries and paginated staff queries.

To see these changes on the hosted site, push and redeploy through the existing
deployment process, then reload the page. No deployment is performed by these tests.
