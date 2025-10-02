const { execSync } = require('child_process');
const request = require('supertest');
const app = require('../src/app');
const { calculateStaySummary } = require('../src/utils/booking');
const { getUserByEmail } = require('../src/models/users');
const { getRoomBySlug } = require('../src/models/rooms');
const { createBooking, getBookingById } = require('../src/models/bookings');
const { createPaymentAndCapture, getPaymentByBookingId } = require('../src/models/payments');
const { saveMessage, listMessagesByRoom } = require('../src/models/chat');
const { getAllInquiries } = require('../src/models/inquiries');

describe('Skyhaven core flows', () => {
  beforeEach(() => {
    execSync('node scripts/seed.js');
  });

  test('creates a pending booking with totals', () => {
    const user = getUserByEmail('nova@guest.test');
    const room = getRoomBySlug('celestial-horizon-suite');
    const summary = calculateStaySummary(room, '2025-01-10', '2025-01-13', []);
    const booking = createBooking({
      userId: user.id,
      roomTypeId: room.id,
      checkIn: new Date('2025-01-10').toISOString(),
      checkOut: new Date('2025-01-13').toISOString(),
      guests: 2,
      addOns: [],
      total: summary.total,
      taxes: summary.taxes,
      fees: summary.fees,
      status: 'PendingPayment'
    });
    expect(booking.status).toBe('PendingPayment');
    const stored = getBookingById(booking.id);
    expect(stored.total).toBeCloseTo(summary.total, 2);
  });

  test('captures a payment for a booking', () => {
    const user = getUserByEmail('nova@guest.test');
    const room = getRoomBySlug('nebula-immersion-loft');
    const summary = calculateStaySummary(room, '2025-02-01', '2025-02-04', []);
    const booking = createBooking({
      userId: user.id,
      roomTypeId: room.id,
      checkIn: new Date('2025-02-01').toISOString(),
      checkOut: new Date('2025-02-04').toISOString(),
      guests: 2,
      addOns: [],
      total: summary.total,
      taxes: summary.taxes,
      fees: summary.fees,
      status: 'PendingPayment'
    });
    createPaymentAndCapture({
      bookingId: booking.id,
      amount: booking.total,
      last4: '4242',
      currency: 'USD'
    });
    const payment = getPaymentByBookingId(booking.id);
    expect(payment.status).toBe('captured');
  });

  test('persists chat messages to a room', () => {
    const user = getUserByEmail('nova@guest.test');
    const message = saveMessage({ room: 'lobby', fromUserId: user.id, body: 'Testing persistence' });
    const history = listMessagesByRoom('lobby');
    const found = history.find((entry) => entry.id === message.id);
    expect(found).toBeTruthy();
    expect(found.body).toBe('Testing persistence');
  });

  test('routes contact form submissions to guest inquiries', async () => {
    const agent = request.agent(app);
    const response = await agent.get('/contact');
    expect(response.status).toBe(200);
    const tokenMatch = response.text.match(/name="_csrf" value="([^"]+)"/);
    expect(tokenMatch).toBeTruthy();
    const csrfToken = tokenMatch[1];

    const submit = await agent
      .post('/contact')
      .type('form')
      .send({
        _csrf: csrfToken,
        name: 'Jest Contact',
        email: 'jest-contact@example.com',
        message: 'This is a contact submission from the automated test suite.'
      });

    expect(submit.status).toBe(302);
    expect(submit.headers.location).toBe('/contact');

    const inquiries = getAllInquiries();
    const saved = inquiries.find((entry) => entry.email === 'jest-contact@example.com');
    expect(saved).toBeTruthy();
    expect(saved.message).toContain('automated test suite');
  });
});
