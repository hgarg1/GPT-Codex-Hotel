const { v4: uuidv4 } = require('uuid');

// In-memory booking records representing the simulated Skyhaven database layer.
const bookings = [];

function createBooking(data) {
  const booking = {
    id: uuidv4(),
    status: 'confirmed',
    createdAt: new Date().toISOString(),
    ...data
  };
  bookings.push(booking);
  return booking;
}

function getBookingsByUser(userId) {
  return bookings.filter((booking) => booking.userId === userId);
}

function getAllBookings() {
  return bookings;
}

function cancelBooking(id, userId) {
  const booking = bookings.find((entry) => entry.id === id && entry.userId === userId);
  if (!booking) {
    return { booking: null, wasUpdated: false };
  }
  if (booking.status === 'cancelled') {
    return { booking, wasUpdated: false };
  }
  booking.status = 'cancelled';
  booking.cancelledAt = new Date().toISOString();
  return { booking, wasUpdated: true };
}

module.exports = {
  bookings,
  createBooking,
  getBookingsByUser,
  getAllBookings,
  cancelBooking
};
