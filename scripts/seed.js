const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../src/db');
const { encryptText } = require('../src/utils/crypto');

const db = getDb();

function resetSchema() {
  db.exec(`
    DROP TABLE IF EXISTS payment_reversals;
    DROP TABLE IF EXISTS chat_reports;
    DROP TABLE IF EXISTS chat_blocks;
    DROP TABLE IF EXISTS chat_messages;
    DROP TABLE IF EXISTS amenity_reservations;
    DROP TABLE IF EXISTS payments;
    DROP TABLE IF EXISTS bookings;
    DROP TABLE IF EXISTS amenities;
    DROP TABLE IF EXISTS guest_inquiries;
    DROP TABLE IF EXISTS room_types;
    DROP TABLE IF EXISTS users;
  `);

  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('guest','admin')),
      phone TEXT,
      bio TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE room_types (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      pricePerNight REAL NOT NULL,
      capacity INTEGER NOT NULL,
      squareFeet INTEGER,
      bedConfig TEXT,
      view TEXT,
      description TEXT,
      features TEXT,
      images TEXT,
      addOns TEXT,
      availability INTEGER NOT NULL DEFAULT 5,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE amenities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      category TEXT,
      longDescription TEXT,
      hours TEXT,
      location TEXT,
      capacity INTEGER,
      images TEXT,
      cta TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE bookings (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      roomTypeId TEXT NOT NULL,
      checkIn TEXT NOT NULL,
      checkOut TEXT NOT NULL,
      guests INTEGER NOT NULL,
      addOns TEXT,
      total REAL NOT NULL,
      taxes REAL NOT NULL,
      fees REAL NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Reserved','PendingPayment','Paid','Canceled')),
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (roomTypeId) REFERENCES room_types(id) ON DELETE CASCADE
    );

    CREATE TABLE payments (
      id TEXT PRIMARY KEY,
      bookingId TEXT NOT NULL UNIQUE,
      method TEXT NOT NULL,
      last4 TEXT,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('authorized','captured','failed','refunded')),
      providerRef TEXT,
      receiptNumber TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (bookingId) REFERENCES bookings(id) ON DELETE CASCADE
    );

    CREATE TABLE amenity_reservations (
      id TEXT PRIMARY KEY,
      amenityId TEXT NOT NULL,
      userId TEXT NOT NULL,
      timeslotStart TEXT NOT NULL,
      timeslotEnd TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('reserved','waitlist','cancelled')),
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (amenityId) REFERENCES amenities(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE guest_inquiries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('open','resolved')) DEFAULT 'open',
      receivedAt TEXT NOT NULL,
      resolvedAt TEXT
    );

    CREATE TABLE chat_messages (
      id TEXT PRIMARY KEY,
      room TEXT NOT NULL,
      fromUserId TEXT NOT NULL,
      toUserId TEXT,
      body TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (fromUserId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (toUserId) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE chat_blocks (
      blockerId TEXT NOT NULL,
      blockedId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      PRIMARY KEY (blockerId, blockedId),
      FOREIGN KEY (blockerId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (blockedId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE chat_reports (
      id TEXT PRIMARY KEY,
      reporterId TEXT NOT NULL,
      targetUserId TEXT NOT NULL,
      messageId TEXT,
      reason TEXT NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (reporterId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (targetUserId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (messageId) REFERENCES chat_messages(id) ON DELETE SET NULL
    );

    CREATE TABLE payment_reversals (
      id TEXT PRIMARY KEY,
      paymentId TEXT NOT NULL,
      amount REAL NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (paymentId) REFERENCES payments(id) ON DELETE CASCADE
    );
  `);
}

function insertUsers() {
  const users = [
    { name: 'Astra Vega', email: 'astra@skyhaven.test', role: 'admin' },
    { name: 'Kael Orion', email: 'kael@skyhaven.test', role: 'admin' },
    { name: 'Nova Lin', email: 'nova@guest.test', role: 'guest' },
    { name: 'Juno Aki', email: 'juno@guest.test', role: 'guest' },
    { name: 'Mira Sol', email: 'mira@guest.test', role: 'guest' }
  ];

  const stmt = db.prepare(`
    INSERT INTO users (id, name, email, passwordHash, role, phone, bio, createdAt, updatedAt)
    VALUES (@id, @name, @email, @passwordHash, @role, @phone, @bio, @createdAt, @updatedAt)
  `);

  const now = new Date().toISOString();
  users.forEach((user, index) => {
    const id = uuidv4();
    const passwordHash = bcrypt.hashSync('skyhaven123', 10);
    stmt.run({
      id,
      name: user.name,
      email: user.email,
      passwordHash,
      role: user.role,
      phone: index < 2 ? '+1-555-0000' + index : null,
      bio: index < 2 ? 'Skyhaven curator overseeing guest journeys.' : null,
      createdAt: now,
      updatedAt: now
    });
  });
}

function insertRoomTypes() {
  const rooms = [
    {
      name: 'Celestial Horizon Suite',
      slug: 'celestial-horizon-suite',
      pricePerNight: 880,
      capacity: 4,
      squareFeet: 1200,
      bedConfig: '1 Aurora King + 1 Nebula Sofa',
      view: 'Orbital skyline',
      description: 'Panoramic holo-glass walls with adaptive climate cocoons.',
      features: [
        'Adaptive gravity sleep system',
        'Private levitation spa',
        'AI-curated minibar',
        'Quantum-secure workspace'
      ],
      images: ['/images/suite.svg', '/images/nebula.svg'],
      addOns: [
        { id: 'late-checkout', name: 'Late checkout', price: 80 },
        { id: 'breakfast-suite', name: 'Suite breakfast experience', price: 120 }
      ],
      availability: 5
    },
    {
      name: 'Nebula Immersion Loft',
      slug: 'nebula-immersion-loft',
      pricePerNight: 640,
      capacity: 3,
      squareFeet: 900,
      bedConfig: '1 Quantum Queen',
      view: 'Holographic nebula atrium',
      description: 'Bioluminescent panels respond to your heart rate to craft a personal nebula.',
      features: [
        'Biofeedback light choreography',
        'Zero-noise sleep canopy',
        'Immersive sound temple'
      ],
      images: ['/images/nebula.svg', '/images/suite.svg'],
      addOns: [
        { id: 'breakfast', name: 'Nebula breakfast tasting', price: 65 },
        { id: 'ai-butler', name: 'Dedicated AI butler', price: 150 }
      ],
      availability: 7
    },
    {
      name: 'Gravity Well Villa',
      slug: 'gravity-well-villa',
      pricePerNight: 1280,
      capacity: 6,
      squareFeet: 2100,
      bedConfig: '2 Stellar Kings + 2 Halo Twins',
      view: 'Anti-grav lagoon',
      description: 'Suspended lounge with levitating daybeds over a cascading photon waterfall.',
      features: [
        'Private infinity skypool',
        'Autonomous concierge drone',
        'Outdoor aroma garden',
        'Holographic cinema dome'
      ],
      images: ['/images/skyline.svg', '/images/suite.svg'],
      addOns: [
        { id: 'chef', name: 'In-villa chef tasting', price: 420 },
        { id: 'heli-transfer', name: 'Heli-lift arrival', price: 380 }
      ],
      availability: 3
    },
    {
      name: 'Aurora Pulse Chamber',
      slug: 'aurora-pulse-chamber',
      pricePerNight: 420,
      capacity: 2,
      squareFeet: 600,
      bedConfig: '1 Pulse Pod',
      view: 'Stellar wellness circuit',
      description: 'Zero-noise chamber with aurora pulse therapy for lucid dreaming.',
      features: [
        'Aurora pulse therapy',
        'Circadian audio landscape',
        'Personal meditation AI'
      ],
      images: ['/images/nebula.svg', '/images/skyline.svg'],
      addOns: [
        { id: 'soundbath', name: 'Sound bath immersion', price: 55 }
      ],
      availability: 10
    },
    {
      name: 'Luminous Tidal Pavilion',
      slug: 'luminous-tidal-pavilion',
      pricePerNight: 980,
      capacity: 5,
      squareFeet: 1500,
      bedConfig: '2 Tidal Queens + 1 Halo Nest',
      view: 'Bioluminescent tide garden',
      description: 'Floating pavilion with kinetic tide pools choreographed to lunar rhythms.',
      features: [
        'Kinetic tide pool deck',
        'Ocean-resonance sound chamber',
        'Private moonbeam tasting bar'
      ],
      images: ['/images/suite.svg', '/images/skyline.svg'],
      addOns: [
        { id: 'tidal-tasting', name: 'Moonbeam tasting flight', price: 180 },
        { id: 'tide-concierge', name: 'Tide concierge for night rituals', price: 140 }
      ],
      availability: 4
    },
    {
      name: 'Zenith Observatory Pod',
      slug: 'zenith-observatory-pod',
      pricePerNight: 560,
      capacity: 2,
      squareFeet: 720,
      bedConfig: '1 Horizon King',
      view: '360° starfield dome',
      description: 'Observation pod with adaptive telescope canopy and meteor shower alarms.',
      features: [
        'Celestial projection dome',
        'Autonomous star-mapping assistant',
        'Aurora tea ritual bench'
      ],
      images: ['/images/nebula.svg', '/images/skyline.svg'],
      addOns: [
        { id: 'meteor-alert', name: 'Personal meteor alert service', price: 65 },
        { id: 'stargazer', name: 'Guided midnight constellation walk', price: 95 }
      ],
      availability: 9
    },
    {
      name: 'Chrono Dream Capsule',
      slug: 'chrono-dream-capsule',
      pricePerNight: 360,
      capacity: 1,
      squareFeet: 420,
      bedConfig: '1 Chrono Cocoon',
      view: 'Temporal meditation atrium',
      description: 'Solo capsule designed for chrono-therapy sleep with lucid dream sequencing.',
      features: [
        'Chrono sleep sequencer',
        'Lucid dream guidance AI',
        'Aroma memory diffuser'
      ],
      images: ['/images/nebula.svg'],
      addOns: [
        { id: 'chrono-coach', name: 'Chrono sleep coach session', price: 70 },
        { id: 'memory-journal', name: 'Dream memory journal kit', price: 35 }
      ],
      availability: 12
    },
    {
      name: 'Solar Flare Gallery Suite',
      slug: 'solar-flare-gallery-suite',
      pricePerNight: 740,
      capacity: 3,
      squareFeet: 1100,
      bedConfig: '1 Radiant King + 1 Lumen Lounger',
      view: 'Solar flare art promenade',
      description: 'Immersive art gallery suite where kinetic sculptures respond to solar activity.',
      features: [
        'Solar flare kinetic gallery',
        'Private scent-wave atelier',
        'AI-curated vinyl lounge'
      ],
      images: ['/images/suite.svg', '/images/nebula.svg'],
      addOns: [
        { id: 'gallery-tour', name: 'Curated art immersion tour', price: 160 },
        { id: 'vinyl-session', name: 'Analog vinyl soundscape session', price: 90 }
      ],
      availability: 6
    }
  ];

  const stmt = db.prepare(`
    INSERT INTO room_types (id, name, slug, pricePerNight, capacity, squareFeet, bedConfig, view, description, features, images, addOns, availability, createdAt, updatedAt)
    VALUES (@id, @name, @slug, @pricePerNight, @capacity, @squareFeet, @bedConfig, @view, @description, @features, @images, @addOns, @availability, @createdAt, @updatedAt)
  `);

  const now = new Date().toISOString();
  rooms.forEach((room) => {
    stmt.run({
      id: uuidv4(),
      name: room.name,
      slug: room.slug,
      pricePerNight: room.pricePerNight,
      capacity: room.capacity,
      squareFeet: room.squareFeet,
      bedConfig: room.bedConfig,
      view: room.view,
      description: room.description,
      features: JSON.stringify(room.features),
      images: JSON.stringify(room.images),
      addOns: JSON.stringify(room.addOns),
      availability: room.availability,
      createdAt: now,
      updatedAt: now
    });
  });
}

function insertAmenities() {
  const amenities = [
    {
      name: 'Sky Spa Sanctuary',
      slug: 'sky-spa-sanctuary',
      category: 'Wellness',
      longDescription: 'Cloud-top hydrotherapy, gravity massage pods, and chroma saunas tuned to your biometric signature.',
      hours: 'Daily 06:00 – 23:00',
      location: 'Level 42 – Stratosphere Wing',
      capacity: 18,
      images: ['/images/skyline.svg'],
      cta: 'Book Sky Spa Journey'
    },
    {
      name: 'Quantum Gym',
      slug: 'quantum-gym',
      category: 'Fitness',
      longDescription: 'Anti-gravity training rigs, holographic sparring partners, and chrono cycle spin theatre.',
      hours: 'Daily 24 Hours',
      location: 'Level 12 – Vitality Concourse',
      capacity: 40,
      images: ['/images/nebula.svg'],
      cta: 'Schedule Training'
    },
    {
      name: 'Orbital Pool',
      slug: 'orbital-pool',
      category: 'Recreation',
      longDescription: 'Zero-edge infinity pool with celestial projection dome and levitating daybeds.',
      hours: 'Daily 07:00 – 22:00',
      location: 'Skydeck Terrace',
      capacity: 60,
      images: ['/images/suite.svg'],
      cta: 'Reserve Cabana'
    },
    {
      name: 'Neon Dining Collective',
      slug: 'neon-dining-collective',
      category: 'Dining',
      longDescription: 'Immersive culinary theatre with synesthetic tasting menus and AI sommeliers.',
      hours: 'Daily 17:00 – 02:00',
      location: 'Level 08 – Luminous Arcade',
      images: ['/images/nebula.svg'],
      cta: 'Join Tasting Waitlist'
    },
    {
      name: 'Virtual Reality Lounge',
      slug: 'virtual-reality-lounge',
      category: 'Entertainment',
      longDescription: 'Multi-sensory VR journeys from Martian dunes to deep-ocean reefs with tactile feedback suits.',
      hours: 'Daily 10:00 – 01:00',
      location: 'Level 05 – Immersion Quarter',
      capacity: 24,
      images: ['/images/suite.svg'],
      cta: 'Book Expedition'
    },
    {
      name: 'Executive Quantum Hub',
      slug: 'executive-quantum-hub',
      category: 'Business',
      longDescription: 'Quantum-secure conference pods, AI note synthesis, and holo telepresence boardrooms.',
      hours: 'Weekdays 06:00 – 22:00',
      location: 'Level 18 – Nexus Tower',
      capacity: 30,
      images: ['/images/skyline.svg'],
      cta: 'Reserve Pod'
    }
  ];

  const stmt = db.prepare(`
    INSERT INTO amenities (id, name, slug, category, longDescription, hours, location, capacity, images, cta, createdAt, updatedAt)
    VALUES (@id, @name, @slug, @category, @longDescription, @hours, @location, @capacity, @images, @cta, @createdAt, @updatedAt)
  `);

  const now = new Date().toISOString();
  amenities.forEach((amenity) => {
    stmt.run({
      id: uuidv4(),
      name: amenity.name,
      slug: amenity.slug,
      category: amenity.category,
      longDescription: amenity.longDescription,
      hours: amenity.hours,
      location: amenity.location,
      capacity: amenity.capacity ?? null,
      images: JSON.stringify(amenity.images),
      cta: amenity.cta,
      createdAt: now,
      updatedAt: now
    });
  });
}

function insertSampleBookings() {
  const getUser = db.prepare('SELECT id FROM users WHERE email = ?');
  const getRoom = db.prepare('SELECT id, pricePerNight FROM room_types WHERE slug = ?');

  const nova = getUser.get('nova@guest.test');
  const juno = getUser.get('juno@guest.test');
  const mira = getUser.get('mira@guest.test');
  const celestial = getRoom.get('celestial-horizon-suite');
  const nebula = getRoom.get('nebula-immersion-loft');
  const pulse = getRoom.get('aurora-pulse-chamber');

  const bookings = [
    {
      userId: nova.id,
      roomTypeId: celestial.id,
      checkIn: '2024-08-01',
      checkOut: '2024-08-05',
      guests: 2,
      addOns: ['late-checkout'],
      status: 'Paid',
      basePrice: celestial.pricePerNight
    },
    {
      userId: juno.id,
      roomTypeId: nebula.id,
      checkIn: '2024-08-10',
      checkOut: '2024-08-12',
      guests: 2,
      addOns: ['breakfast'],
      status: 'PendingPayment',
      basePrice: nebula.pricePerNight
    },
    {
      userId: mira.id,
      roomTypeId: pulse.id,
      checkIn: '2024-09-20',
      checkOut: '2024-09-23',
      guests: 1,
      addOns: [],
      status: 'Reserved',
      basePrice: pulse.pricePerNight
    }
  ];

  const bookingStmt = db.prepare(`
    INSERT INTO bookings (id, userId, roomTypeId, checkIn, checkOut, guests, addOns, total, taxes, fees, status, createdAt, updatedAt)
    VALUES (@id, @userId, @roomTypeId, @checkIn, @checkOut, @guests, @addOns, @total, @taxes, @fees, @status, @createdAt, @updatedAt)
  `);

  const paymentStmt = db.prepare(`
    INSERT INTO payments (id, bookingId, method, last4, amount, currency, status, providerRef, receiptNumber, createdAt, updatedAt)
    VALUES (@id, @bookingId, @method, @last4, @amount, @currency, @status, @providerRef, @receiptNumber, @createdAt, @updatedAt)
  `);

  bookings.forEach((booking, index) => {
    const checkIn = new Date(booking.checkIn);
    const checkOut = new Date(booking.checkOut);
    const nights = Math.max(1, Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24)));
    const baseTotal = booking.basePrice * nights;
    const taxes = Math.round(baseTotal * 0.12 * 100) / 100;
    const fees = Math.round(baseTotal * 0.05 * 100) / 100;
    const total = Math.round((baseTotal + taxes + fees) * 100) / 100;
    const id = uuidv4();
    const now = new Date().toISOString();
    bookingStmt.run({
      id,
      userId: booking.userId,
      roomTypeId: booking.roomTypeId,
      checkIn: new Date(booking.checkIn).toISOString(),
      checkOut: new Date(booking.checkOut).toISOString(),
      guests: booking.guests,
      addOns: JSON.stringify(booking.addOns),
      total,
      taxes,
      fees,
      status: booking.status,
      createdAt: now,
      updatedAt: now
    });

    if (booking.status === 'Paid') {
      paymentStmt.run({
        id: uuidv4(),
        bookingId: id,
        method: 'card',
        last4: '4242',
        amount: total,
        currency: 'USD',
        status: 'captured',
        providerRef: `AUTH-${index + 1010}`,
        receiptNumber: `RCP-${index + 5000}`,
        createdAt: now,
        updatedAt: now
      });
    }
  });
}

function insertAmenityReservations() {
  const getUser = db.prepare('SELECT id FROM users WHERE email = ?');
  const getAmenity = db.prepare('SELECT id FROM amenities WHERE slug = ?');

  const nova = getUser.get('nova@guest.test');
  const spa = getAmenity.get('sky-spa-sanctuary');
  const vr = getAmenity.get('virtual-reality-lounge');

  const reservations = [
    {
      amenityId: spa.id,
      userId: nova.id,
      start: new Date('2024-08-02T09:00:00Z').toISOString(),
      end: new Date('2024-08-02T10:30:00Z').toISOString(),
      status: 'reserved'
    },
    {
      amenityId: vr.id,
      userId: nova.id,
      start: new Date('2024-08-03T20:00:00Z').toISOString(),
      end: new Date('2024-08-03T21:00:00Z').toISOString(),
      status: 'waitlist'
    }
  ];

  const stmt = db.prepare(`
    INSERT INTO amenity_reservations (id, amenityId, userId, timeslotStart, timeslotEnd, status, createdAt, updatedAt)
    VALUES (@id, @amenityId, @userId, @timeslotStart, @timeslotEnd, @status, @createdAt, @updatedAt)
  `);

  reservations.forEach((reservation) => {
    const now = new Date().toISOString();
    stmt.run({
      id: uuidv4(),
      amenityId: reservation.amenityId,
      userId: reservation.userId,
      timeslotStart: reservation.start,
      timeslotEnd: reservation.end,
      status: reservation.status,
      createdAt: now,
      updatedAt: now
    });
  });
}

function insertGuestInquiries() {
  const inquiries = [
    {
      name: 'Lyra Chen',
      email: 'lyra@orbitalmail.test',
      message: 'Do you offer extended stays for remote teams exploring the Skydeck labs?',
      status: 'open',
      receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString()
    },
    {
      name: 'Cassian Roe',
      email: 'cassian@deepcurrent.test',
      message: 'Looking to arrange a proposal dinner inside the Neon Dining Collective holographic suite.',
      status: 'open',
      receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString()
    },
    {
      name: 'Elara Nyx',
      email: 'elara@stellarnav.test',
      message: 'Thank you for the seamless stay. Please close the ticket for the VR lounge latency report.',
      status: 'resolved',
      receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
      resolvedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()
    }
  ];

  const stmt = db.prepare(`
    INSERT INTO guest_inquiries (id, name, email, message, status, receivedAt, resolvedAt)
    VALUES (@id, @name, @email, @message, @status, @receivedAt, @resolvedAt)
  `);

  inquiries.forEach((inquiry) => {
    stmt.run({
      id: uuidv4(),
      name: inquiry.name,
      email: inquiry.email,
      message: inquiry.message,
      status: inquiry.status,
      receivedAt: inquiry.receivedAt,
      resolvedAt: inquiry.resolvedAt ?? null
    });
  });
}

function insertChatHistory() {
  const users = db.prepare('SELECT id, email FROM users').all();
  const lobbyMessages = [
    {
      room: 'lobby',
      from: users.find((u) => u.email === 'astra@skyhaven.test').id,
      body: 'Welcome to the Aurora Nexus Skyhaven lobby! Feel free to ask anything.'
    },
    {
      room: 'lobby',
      from: users.find((u) => u.email === 'nova@guest.test').id,
      body: 'Excited for my Sky Spa reservation tomorrow!'
    }
  ];

  const stmt = db.prepare(`
    INSERT INTO chat_messages (id, room, fromUserId, toUserId, body, createdAt)
    VALUES (@id, @room, @fromUserId, @toUserId, @body, @createdAt)
  `);

  lobbyMessages.forEach((message, index) => {
    stmt.run({
      id: uuidv4(),
      room: message.room,
      fromUserId: message.from,
      toUserId: null,
      body: encryptText(message.body),
      createdAt: new Date(Date.now() - (index + 1) * 60 * 60 * 1000).toISOString()
    });
  });
}

function main() {
  resetSchema();
  insertUsers();
  insertRoomTypes();
  insertAmenities();
  insertSampleBookings();
  insertAmenityReservations();
  insertGuestInquiries();
  insertChatHistory();
  console.log('Database seeded with immersive Skyhaven data.');
}

main();
