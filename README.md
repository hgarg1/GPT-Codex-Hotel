# GPT-Codex-Hotel

Aurora Nexus Skyhaven is an end-to-end Express.js experience showcasing a futuristic hotel. The project includes multi-step bookings, amenities with time-slot reservations, mocked payments, a printable invoice, an authenticated dashboard, and real-time chat powered by Socket.IO.

## Features

- **Room catalogue** with rich specifications, enhancements, and comparison table.
- **Booking wizard** (dates → room → guests/add-ons → review → payment → confirmation) with capacity validation and tax/fee calculations.
- **Amenities hub** with detail pages and reservation workflow that respects capacity.
- **Mock payment flow** (Luhn validation, capture, invoices, webhook endpoint, admin refund).
- **Guest dashboard** showing bookings, amenity reservations, profile/security management.
- **Live chat** for lobby, stay-specific rooms, and direct messages. Presence, typing indicators, rate limiting, profanity filtering, and persistence are included.
- **Admin control deck** to adjust inventory, review bookings/payments, and handle refunds.
- **SQLite persistence** with a dedicated seed script and session storage.

## Getting Started

```bash
npm install
npm run seed
npm run dev
```

- Visit `http://localhost:3000` for the experience.
- Use one of the seeded accounts (password `skyhaven123`):
  - `astra@skyhaven.test` (admin)
  - `kael@skyhaven.test` (admin)
  - `nova@guest.test`
  - `juno@guest.test`
  - `mira@guest.test`

## Scripts

- `npm run dev` – start the development server with nodemon.
- `npm run seed` – reset and seed the SQLite database with demo data.
- `npm test` – run Jest tests covering booking creation, payment capture, and chat persistence.

## Testing Notes

Tests automatically reseed the database before each case. The chat tests exercise the persistence layer, while booking and payment tests validate totals and captured state.

## Real-time Chat Tips

- Visit `/chat` while logged in. Lobby is joined automatically, stay rooms are derived from active bookings, and DMs can be initiated via the sidebar.
- Presence badges turn cyan when contacts are online.
- Typing indicators appear at the top of the chat window.

## Mock Payment Walkthrough

1. Create a booking through `/book` and review the totals.
2. Visit `/pay/:bookingId`, use any future expiry and CVC with card number `4242 4242 4242 4242`.
3. Upon submission the booking is marked Paid, a receipt is generated, and `/pay/:id/confirmation` links to the printable invoice.
4. Admins can trigger refunds from `/admin` which create reversal records.

Enjoy exploring the future of hospitality!
