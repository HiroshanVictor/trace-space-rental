# 4-minute Hackathon demonstration (T2T)

**1. The Excel problem (30 seconds):** "Trace Expert City used spreadsheets and phone calls. We need to prevent accidental double reservations."

**2. Manage spaces (45 seconds):** Staff portal → Spaces Management → Add Space. Enter name, category, capacity, amenities, rates. Show Edit, Archive, Restore and Delete for unused spaces. Desk Zone supports multiple desk units.

**3. Show calendar + first reservation (60 seconds):** Open Availability Calendar, pick tomorrow, click on a free meeting room slot and create a confirmed booking. Add customer details and save. Show a successful confirmation.

**4. Show the critical conflict test (60 seconds):** Create a second booking on the *same meeting room* during an overlapping time. Show the clear "Time clash" rejection. Then create a booking starting exactly when the first ends; it succeeds. Mention desk inventory: if 14 desks exist, booking 12 and then 3 in the same period must be refused.

**5. Public inquiry (30 seconds):** Open Public Website → Our Spaces → Inquire. Submit a name, phone, email, preferred dates and a message. Back in the staff portal, Inquiries → Convert to booking (checks clashes again).

**6. Business extras (15 seconds):** Show manual payments, maintenance time blocks, reports and CSV download. Explain that the simple demo is local browser storage; shared online use requires Supabase, included in the package.

**Judging tip:** Demonstrate an actual rejected overlap — this is the non-negotiable functionality from the PowerPoint.
