const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../src/db');
const { encryptText } = require('../src/utils/crypto');
const { Roles, Permissions, ALL_PERMISSIONS } = require('../src/utils/rbac');
const {
  diningMenuSections,
  diningMenuItems,
  diningStaff: seedDiningStaff,
  diningSeats: seedDiningSeats,
} = require('../src/data/dining');

const db = getDb();

function envOrDefault(key, fallback) {
  const value = process.env[key];
  if (!value) {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

const BOOTSTRAP_ACCOUNTS = {
  global: {
    name: envOrDefault('SEED_GLOBAL_ADMIN_NAME', 'Celeste Arin'),
    email: envOrDefault('SEED_GLOBAL_ADMIN_EMAIL', 'global.admin@skyhaven.dev'),
    password: envOrDefault('SEED_GLOBAL_ADMIN_PASSWORD', 'SkyhavenGlobal!23'),
    department: envOrDefault('SEED_GLOBAL_ADMIN_DEPARTMENT', 'Executive Command')
  },
  superAdmins: [
    {
      name: envOrDefault('SEED_SUPER_ADMIN_ONE_NAME', 'Orion Pax'),
      email: envOrDefault('SEED_SUPER_ADMIN_ONE_EMAIL', 'super.orion@skyhaven.dev'),
      password: envOrDefault('SEED_SUPER_ADMIN_ONE_PASSWORD', 'SuperNova!23'),
      department: envOrDefault('SEED_SUPER_ADMIN_ONE_DEPARTMENT', 'Operations Control')
    },
    {
      name: envOrDefault('SEED_SUPER_ADMIN_TWO_NAME', 'Lyric Hale'),
      email: envOrDefault('SEED_SUPER_ADMIN_TWO_EMAIL', 'super.lyric@skyhaven.dev'),
      password: envOrDefault('SEED_SUPER_ADMIN_TWO_PASSWORD', 'SuperAurora!23'),
      department: envOrDefault('SEED_SUPER_ADMIN_TWO_DEPARTMENT', 'Finance & Compliance')
    },
    {
      name: envOrDefault('SEED_SUPER_ADMIN_THREE_NAME', 'Vela Quinn'),
      email: envOrDefault('SEED_SUPER_ADMIN_THREE_EMAIL', 'super.vela@skyhaven.dev'),
      password: envOrDefault('SEED_SUPER_ADMIN_THREE_PASSWORD', 'SuperCosmos!23'),
      department: envOrDefault('SEED_SUPER_ADMIN_THREE_DEPARTMENT', 'Guest Experience Ops')
    }
  ]
};

const DEFAULT_ROLE_PERMISSIONS = {
  [Roles.GLOBAL_ADMIN]: new Set(ALL_PERMISSIONS),
  [Roles.SUPER_ADMIN]: new Set(ALL_PERMISSIONS),
  [Roles.ADMIN]: new Set([
    Permissions.MANAGE_EMPLOYEES,
    Permissions.RESET_PASSWORDS
  ]),
  [Roles.EMPLOYEE]: new Set(),
  [Roles.GUEST]: new Set()
};

function resetSchema() {
  db.exec(`
    DROP TABLE IF EXISTS employee_requests;
    DROP TABLE IF EXISTS employees;
    DROP TABLE IF EXISTS audit_logs;
    DROP TABLE IF EXISTS role_permissions;
    DROP TABLE IF EXISTS dining_reservations;
    DROP TABLE IF EXISTS dining_menu_items;
    DROP TABLE IF EXISTS dining_menu_sections;
    DROP TABLE IF EXISTS dining_tables;
    DROP TABLE IF EXISTS dining_users;
    DROP TABLE IF EXISTS dining_config;
    DROP TABLE IF EXISTS dining_staff;
    DROP TABLE IF EXISTS payment_reversals;
    DROP TABLE IF EXISTS chat_reports;
    DROP TABLE IF EXISTS chat_blocks;
    DROP TABLE IF EXISTS chat_files;
    DROP TABLE IF EXISTS chat_reactions;
    DROP TABLE IF EXISTS chat_receipts;
    DROP TABLE IF EXISTS chat_messages;
    DROP TABLE IF EXISTS amenity_reservations;
    DROP TABLE IF EXISTS payments;
    DROP TABLE IF EXISTS bookings;
    DROP TABLE IF EXISTS amenities;
    DROP TABLE IF EXISTS guest_inquiries;
    DROP TABLE IF EXISTS room_types;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS roles;
  `);

  db.exec(`
    CREATE TABLE roles (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      priority INTEGER NOT NULL UNIQUE
    );

    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
      phone TEXT,
      bio TEXT,
      department TEXT,
      status TEXT NOT NULL CHECK(status IN ('active','suspended','terminated')) DEFAULT 'active',
      createdByUserId TEXT REFERENCES users(id) ON DELETE SET NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      mustChangePassword INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE role_permissions (
      roleId TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission TEXT NOT NULL,
      allowed INTEGER NOT NULL DEFAULT 0,
      updatedAt TEXT NOT NULL,
      updatedByUserId TEXT REFERENCES users(id) ON DELETE SET NULL,
      PRIMARY KEY (roleId, permission)
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

    CREATE TABLE chat_files (
      id TEXT PRIMARY KEY,
      messageId TEXT NOT NULL,
      filename TEXT NOT NULL,
      mimeType TEXT NOT NULL,
      size INTEGER NOT NULL,
      data BLOB NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (messageId) REFERENCES chat_messages(id) ON DELETE CASCADE
    );

    CREATE TABLE chat_reactions (
      messageId TEXT NOT NULL,
      userId TEXT NOT NULL,
      emoji TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      PRIMARY KEY (messageId, userId),
      FOREIGN KEY (messageId) REFERENCES chat_messages(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE chat_receipts (
      userId TEXT NOT NULL,
      channel TEXT NOT NULL,
      lastSeenAt TEXT NOT NULL,
      PRIMARY KEY (userId, channel),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
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

    CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY,
      actorUserId TEXT REFERENCES users(id) ON DELETE SET NULL,
      targetUserId TEXT REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      details TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      department TEXT,
      title TEXT,
      employmentType TEXT NOT NULL DEFAULT 'Full-Time',
      startDate TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      emergencyContact TEXT,
      notes TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE employee_requests (
      id TEXT PRIMARY KEY,
      employeeId TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      userId TEXT REFERENCES users(id) ON DELETE SET NULL,
      type TEXT NOT NULL CHECK(type IN ('pto','workers-comp','resignation','transfer')),
      payload TEXT,
      status TEXT NOT NULL CHECK(status IN ('pending','approved','denied')) DEFAULT 'pending',
      comment TEXT,
      decisionByUserId TEXT REFERENCES users(id) ON DELETE SET NULL,
      decisionAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE payment_reversals (
      id TEXT PRIMARY KEY,
      paymentId TEXT NOT NULL,
      amount REAL NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (paymentId) REFERENCES payments(id) ON DELETE CASCADE
    );

    CREATE TABLE dining_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      phone TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE dining_tables (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      rotation INTEGER NOT NULL DEFAULT 0,
      zone TEXT,
      status TEXT NOT NULL DEFAULT 'available',
      active INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE dining_menu_sections (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      "order" INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE dining_menu_items (
      id TEXT PRIMARY KEY,
      sectionId TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      priceCents INTEGER NOT NULL,
      vegetarian INTEGER NOT NULL DEFAULT 0,
      vegan INTEGER NOT NULL DEFAULT 0,
      glutenFree INTEGER NOT NULL DEFAULT 0,
      spicyLevel INTEGER NOT NULL DEFAULT 0,
      hoverDetail TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      active INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (sectionId) REFERENCES dining_menu_sections(id) ON DELETE CASCADE
    );

    CREATE TABLE dining_reservations (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      partySize INTEGER NOT NULL,
      tableIds TEXT NOT NULL,
      status TEXT NOT NULL,
      dietaryPrefs TEXT,
      allergies TEXT,
      contactPhone TEXT,
      contactEmail TEXT,
      notes TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES dining_users(id) ON DELETE CASCADE
    );

    CREATE TABLE dining_config (
      id TEXT PRIMARY KEY,
      dwellMinutes INTEGER NOT NULL,
      blackoutDates TEXT NOT NULL,
      policyText TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE dining_staff (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      bio TEXT,
      photoUrl TEXT,
      badges TEXT NOT NULL DEFAULT '[]',
      nextShift TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);
}

function insertRoles() {
  const stmt = db.prepare(`
    INSERT INTO roles (id, label, priority)
    VALUES (@id, @label, @priority)
  `);
  const roles = [
    { id: Roles.GLOBAL_ADMIN, label: 'Global Administrator', priority: 50 },
    { id: Roles.SUPER_ADMIN, label: 'Super Administrator', priority: 40 },
    { id: Roles.ADMIN, label: 'Administrator', priority: 30 },
    { id: Roles.EMPLOYEE, label: 'Employee', priority: 10 },
    { id: Roles.GUEST, label: 'Guest', priority: 0 }
  ];
  roles.forEach((role) => stmt.run(role));
}

function insertRolePermissions() {
  const stmt = db.prepare(`
    INSERT INTO role_permissions (roleId, permission, allowed, updatedAt, updatedByUserId)
    VALUES (@roleId, @permission, @allowed, @updatedAt, NULL)
  `);
  const now = new Date().toISOString();
  Object.entries(DEFAULT_ROLE_PERMISSIONS).forEach(([roleId, allowedSet]) => {
    ALL_PERMISSIONS.forEach((permission) => {
      stmt.run({
        roleId,
        permission,
        allowed: allowedSet.has(permission) ? 1 : 0,
        updatedAt: now
      });
    });
  });
}

function insertUsers() {
  const stmt = db.prepare(`
    INSERT INTO users (id, name, email, passwordHash, role, phone, bio, department, status, createdByUserId, createdAt, updatedAt, mustChangePassword)
    VALUES (@id, @name, @email, @passwordHash, @role, @phone, @bio, @department, @status, @createdByUserId, @createdAt, @updatedAt, @mustChangePassword)
  `);

  const now = new Date().toISOString();

  const globalId = uuidv4();
  const bootstrapUsers = [
    {
      id: globalId,
      name: BOOTSTRAP_ACCOUNTS.global.name,
      email: BOOTSTRAP_ACCOUNTS.global.email,
      passwordHash: bcrypt.hashSync(BOOTSTRAP_ACCOUNTS.global.password, 10),
      role: Roles.GLOBAL_ADMIN,
      phone: '+1-555-777-0000',
      bio: 'Skyhaven executive steward overseeing the entire constellation.',
      department: BOOTSTRAP_ACCOUNTS.global.department,
      status: 'active',
      createdByUserId: null,
      mustChangePassword: 0
    }
  ];

  BOOTSTRAP_ACCOUNTS.superAdmins.forEach((account, index) => {
    bootstrapUsers.push({
      id: uuidv4(),
      name: account.name,
      email: account.email,
      passwordHash: bcrypt.hashSync(account.password, 10),
      role: Roles.SUPER_ADMIN,
      phone: `+1-555-880-00${index + 1}`,
      bio: 'Skyhaven sector lead empowered to coordinate multi-department operations.',
      department: account.department,
      status: 'active',
      createdByUserId: globalId,
      mustChangePassword: 0
    });
  });

  const firstSuperAdminId = bootstrapUsers.find((user) => user.role === Roles.SUPER_ADMIN)?.id || null;

  const additionalUsers = [
    {
      name: 'Astra Vega',
      email: 'astra@skyhaven.test',
      role: Roles.ADMIN,
      department: 'Guest Experience',
      phone: '+1-555-000000',
      bio: 'Skyhaven curator overseeing guest journeys.',
      mustChangePassword: 0
    },
    {
      name: 'Kael Orion',
      email: 'kael@skyhaven.test',
      role: Roles.ADMIN,
      department: 'Operations Control',
      phone: '+1-555-000001',
      bio: 'Night shift steward harmonising the command deck.',
      mustChangePassword: 0
    },
    {
      name: 'Nova Lin',
      email: 'nova@guest.test',
      role: Roles.GUEST,
      department: 'Guest Experience',
      phone: null,
      bio: null,
      mustChangePassword: 0
    },
    {
      name: 'Juno Aki',
      email: 'juno@guest.test',
      role: Roles.EMPLOYEE,
      department: 'Guest Experience',
      phone: null,
      bio: null,
      mustChangePassword: 0
    },
    {
      name: 'Mira Sol',
      email: 'mira@guest.test',
      role: Roles.GUEST,
      department: 'Wellness Collective',
      phone: null,
      bio: null,
      mustChangePassword: 0
    }
  ];

  additionalUsers.forEach((user) => {
    bootstrapUsers.push({
      id: uuidv4(),
      name: user.name,
      email: user.email,
      passwordHash: bcrypt.hashSync('skyhaven123', 10),
      role: user.role,
      phone: user.phone,
      bio: user.bio,
      department: user.department,
      status: 'active',
      createdByUserId: firstSuperAdminId,
      mustChangePassword: user.mustChangePassword ?? 0
    });
  });

  bootstrapUsers.forEach((user) => {
    stmt.run({
      ...user,
      createdAt: now,
      updatedAt: now
    });
  });
}

function insertEmployees() {
  const stmt = db.prepare(`
    INSERT INTO employees (id, name, email, phone, department, title, employmentType, startDate, status, emergencyContact, notes, createdAt, updatedAt)
    VALUES (@id, @name, @email, @phone, @department, @title, @employmentType, @startDate, @status, @emergencyContact, @notes, @createdAt, @updatedAt)
  `);
  const now = new Date().toISOString();
  const userIndex = new Map(
    db
      .prepare('SELECT id, email, department, role FROM users')
      .all()
      .map((row) => [String(row.email || '').toLowerCase(), row])
  );

  const sampleEmployees = [
    {
      name: BOOTSTRAP_ACCOUNTS.global.name,
      email: BOOTSTRAP_ACCOUNTS.global.email,
      phone: '+1-555-777-0000',
      department: BOOTSTRAP_ACCOUNTS.global.department,
      title: 'Global Administrator',
      employmentType: 'Full-Time',
      startDate: '2015-06-01',
      status: 'active',
      emergencyContact: 'Rin Arin · +1-555-201-2200',
      notes: 'Executive steward responsible for total orbital governance.'
    },
    {
      name: BOOTSTRAP_ACCOUNTS.superAdmins[0].name,
      email: BOOTSTRAP_ACCOUNTS.superAdmins[0].email,
      phone: '+1-555-880-0001',
      department: BOOTSTRAP_ACCOUNTS.superAdmins[0].department,
      title: 'Super Administrator',
      employmentType: 'Full-Time',
      startDate: '2017-03-12',
      status: 'active',
      emergencyContact: 'Cassio Pax · +1-555-880-1010',
      notes: 'Coordinates inter-departmental launch windows.'
    },
    {
      name: BOOTSTRAP_ACCOUNTS.superAdmins[1].name,
      email: BOOTSTRAP_ACCOUNTS.superAdmins[1].email,
      phone: '+1-555-880-0002',
      department: BOOTSTRAP_ACCOUNTS.superAdmins[1].department,
      title: 'Finance Strategist',
      employmentType: 'Full-Time',
      startDate: '2018-08-20',
      status: 'active',
      emergencyContact: 'Morgan Hale · +1-555-870-9900',
      notes: 'Leads compliance cadences and capital planning.'
    },
    {
      name: BOOTSTRAP_ACCOUNTS.superAdmins[2].name,
      email: BOOTSTRAP_ACCOUNTS.superAdmins[2].email,
      phone: '+1-555-880-0003',
      department: BOOTSTRAP_ACCOUNTS.superAdmins[2].department,
      title: 'Experience Director',
      employmentType: 'Full-Time',
      startDate: '2019-02-01',
      status: 'active',
      emergencyContact: 'Rowan Quinn · +1-555-870-1188',
      notes: 'Owns guest delight initiatives across all decks.'
    },
    {
      name: 'Astra Vega',
      email: 'astra@skyhaven.test',
      phone: '+1-555-000000',
      department: 'Guest Experience',
      title: 'Guest Experience Admin',
      employmentType: 'Full-Time',
      startDate: '2020-05-10',
      status: 'active',
      emergencyContact: 'Zara Vega · +1-555-778-1122',
      notes: 'Runs concierge briefings and satisfaction loops.'
    },
    {
      name: 'Kael Orion',
      email: 'kael@skyhaven.test',
      phone: '+1-555-000001',
      department: 'Operations Control',
      title: 'Night Shift Admin',
      employmentType: 'Full-Time',
      startDate: '2021-01-15',
      status: 'on-leave',
      emergencyContact: 'Jon Orion · +1-555-660-8899',
      notes: 'Currently on wellness recharge leave.'
    },
    {
      name: 'Nova Lin',
      email: 'nova@guest.test',
      phone: null,
      department: 'Guest Experience',
      title: 'Concierge Specialist',
      employmentType: 'Part-Time',
      startDate: '2022-07-08',
      status: 'active',
      emergencyContact: 'Lani Lin · +1-555-221-3344',
      notes: 'Focuses on VIP welcome orchestration.'
    },
    {
      name: 'Juno Aki',
      email: 'juno@guest.test',
      phone: null,
      department: 'Guest Experience',
      title: 'Guest Liaison',
      employmentType: 'Part-Time',
      startDate: '2023-01-22',
      status: 'active',
      emergencyContact: 'Mako Aki · +1-555-554-1212',
      notes: 'Leads sunrise arrival rituals.'
    },
    {
      name: 'Mira Sol',
      email: 'mira@guest.test',
      phone: null,
      department: 'Wellness Collective',
      title: 'Wellness Guide',
      employmentType: 'Contract',
      startDate: '2021-09-30',
      status: 'active',
      emergencyContact: 'Tara Sol · +1-555-998-4455',
      notes: 'Provides guided meditation sessions for crew and guests.'
    },
    {
      name: 'Nova Ortega',
      email: 'nova.ortega@auroranexus.com',
      phone: '+1-555-430-9800',
      department: 'Executive Operations',
      title: 'General Manager',
      employmentType: 'Full-Time',
      startDate: '2016-04-04',
      status: 'active',
      emergencyContact: 'Alicia Ortega · +1-555-221-9898',
      notes: 'Imported from leadership council during seeding.'
    },
    {
      name: 'Ilya Rosenthal',
      email: 'ilya.rosenthal@auroranexus.com',
      phone: '+1-555-210-8877',
      department: 'Concierge Intelligence',
      title: 'Director of Concierge Intelligence',
      employmentType: 'Full-Time',
      startDate: '2018-11-19',
      status: 'active',
      emergencyContact: 'Mari Rosenthal · +1-555-332-9090',
      notes: 'Oversees predictive support algorithms.'
    },
    {
      name: 'Captain Idris Vale',
      email: 'idris.vale@auroranexus.com',
      phone: '+1-555-765-4343',
      department: 'Orbital Logistics',
      title: 'Logistics Advisor',
      employmentType: 'Contract',
      startDate: '2020-02-10',
      status: 'suspended',
      emergencyContact: 'Sera Vale · +1-555-765-9090',
      notes: 'Restricted from docking ops pending clearance review.'
    }
  ];

  const inserted = new Set();
  sampleEmployees.forEach((employee) => {
    const key = String(employee.email || '').toLowerCase();
    if (inserted.has(key)) {
      return;
    }
    inserted.add(key);
    const record = {
      id: uuidv4(),
      ...employee,
      createdAt: now,
      updatedAt: now
    };
    stmt.run(record);
  });

  // Backfill requests table with a few pending actions to populate the queue.
  const employeeLookup = new Map(
    db
      .prepare('SELECT id, email FROM employees')
      .all()
      .map((row) => [String(row.email || '').toLowerCase(), row.id])
  );
  const requestStmt = db.prepare(`
    INSERT INTO employee_requests (id, employeeId, userId, type, payload, status, comment, decisionByUserId, decisionAt, createdAt, updatedAt)
    VALUES (@id, @employeeId, @userId, @type, @payload, @status, @comment, @decisionByUserId, @decisionAt, @createdAt, @updatedAt)
  `);
  const pendingRequests = [
    {
      email: 'kael@skyhaven.test',
      type: 'pto',
      payload: { startDate: '2024-09-15', endDate: '2024-09-22', reason: 'Family voyage to the Luma Rings.' }
    },
    {
      email: 'nova@guest.test',
      type: 'transfer',
      payload: { targetDepartment: 'Executive Operations', reason: 'Shadowing leadership rotation.' }
    },
    {
      email: 'idris.vale@auroranexus.com',
      type: 'resignation',
      payload: { lastDay: '2024-10-31', reason: 'Returning to orbital fleet command.' }
    }
  ];

  pendingRequests.forEach((entry) => {
    const employeeId = employeeLookup.get(String(entry.email || '').toLowerCase());
    if (!employeeId) {
      return;
    }
    const user = userIndex.get(String(entry.email || '').toLowerCase());
    const record = {
      id: uuidv4(),
      employeeId,
      userId: user?.id || null,
      type: entry.type,
      payload: JSON.stringify(entry.payload),
      status: 'pending',
      comment: null,
      decisionByUserId: null,
      decisionAt: null,
      createdAt: now,
      updatedAt: now
    };
    requestStmt.run(record);
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

function syncDiningUsersFromCore() {
  const users = db.prepare('SELECT id, email, name, phone FROM users').all();
  const stmt = db.prepare(`
    INSERT INTO dining_users (id, email, name, phone, createdAt, updatedAt)
    VALUES (@id, @email, @name, @phone, @createdAt, @updatedAt)
  `);
  const now = new Date().toISOString();
  users.forEach((user) => {
    stmt.run({
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone ?? null,
      createdAt: now,
      updatedAt: now
    });
  });
}

function insertDiningTables() {
  const stmt = db.prepare(`
    INSERT INTO dining_tables (id, label, capacity, x, y, rotation, zone, status, active, createdAt, updatedAt)
    VALUES (@id, @label, @capacity, @x, @y, @rotation, @zone, @status, @active, @createdAt, @updatedAt)
  `);
  const now = new Date().toISOString();
  seedDiningSeats.forEach((seat, index) => {
    const fallbackX = 120 + (index % 4) * 120;
    const fallbackY = 120 + Math.floor(index / 4) * 120;
    stmt.run({
      id: seat.id,
      label: seat.label ?? seat.id,
      capacity: seat.capacity,
      x: seat.x ?? fallbackX,
      y: seat.y ?? fallbackY,
      rotation: seat.rotation ?? 0,
      zone: seat.zone ?? null,
      status: seat.status ?? 'available',
      active: 1,
      createdAt: now,
      updatedAt: now,
    });
  });
}

function insertDiningMenu() {
  const now = new Date().toISOString();
  const sectionStmt = db.prepare(`
    INSERT INTO dining_menu_sections (id, title, slug, "order", createdAt, updatedAt)
    VALUES (@id, @title, @slug, @order, @createdAt, @updatedAt)
  `);
  const sectionIdByKey = new Map();
  diningMenuSections.forEach((section) => {
    const id = uuidv4();
    sectionIdByKey.set(section.key, id);
    sectionStmt.run({
      id,
      title: section.title,
      slug: section.key,
      order: section.order,
      createdAt: now,
      updatedAt: now,
    });
  });

  const itemStmt = db.prepare(`
    INSERT INTO dining_menu_items (id, sectionId, name, description, priceCents, vegetarian, vegan, glutenFree, spicyLevel, hoverDetail, tags, active, createdAt, updatedAt)
    VALUES (@id, @sectionId, @name, @description, @priceCents, @vegetarian, @vegan, @glutenFree, @spicyLevel, @hoverDetail, @tags, @active, @createdAt, @updatedAt)
  `);

  diningMenuItems.forEach((item) => {
    const sectionId = sectionIdByKey.get(item.course);
    if (!sectionId) {
      return;
    }
    const tags = Array.isArray(item.tags) ? item.tags : [];
    const normalizedTags = tags.map((tag) => tag.toLowerCase());
    itemStmt.run({
      id: uuidv4(),
      sectionId,
      name: item.name,
      description: item.description,
      priceCents: item.priceCents,
      vegetarian: normalizedTags.includes('vegetarian') ? 1 : 0,
      vegan: normalizedTags.includes('vegan') ? 1 : 0,
      glutenFree: normalizedTags.includes('gluten-free') ? 1 : 0,
      spicyLevel: item.spiceLevel ?? 0,
      hoverDetail: item.hoverDetail ?? null,
      tags: JSON.stringify(tags),
      active: 1,
      createdAt: now,
      updatedAt: now,
    });
  });
}

function insertDiningConfig() {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO dining_config (id, dwellMinutes, blackoutDates, policyText, createdAt, updatedAt)
    VALUES ('default', 120, '[]', NULL, @createdAt, @updatedAt)
  `).run({ createdAt: now, updatedAt: now });
}

function insertDiningStaff() {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO dining_staff (id, name, role, bio, photoUrl, badges, nextShift, active, createdAt, updatedAt)
    VALUES (@id, @name, @role, @bio, @photoUrl, @badges, @nextShift, @active, @createdAt, @updatedAt)
  `);
  seedDiningStaff.forEach((member) => {
    stmt.run({
      id: member.id,
      name: member.name,
      role: member.role,
      bio: member.bio ?? null,
      photoUrl: member.photoUrl ?? null,
      badges: JSON.stringify(member.badges || []),
      nextShift: member.nextShift ?? null,
      active: 1,
      createdAt: now,
      updatedAt: now,
    });
  });
}

function insertDiningReservations() {
  const diningUsers = db.prepare('SELECT id FROM dining_users ORDER BY createdAt ASC').all();
  const tables = db.prepare('SELECT id FROM dining_tables ORDER BY label ASC').all();
  if (diningUsers.length === 0 || tables.length < 2) {
    return;
  }
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO dining_reservations (id, userId, date, time, partySize, tableIds, status, dietaryPrefs, allergies, contactPhone, contactEmail, notes, createdAt, updatedAt)
    VALUES (@id, @userId, @date, @time, @partySize, @tableIds, @status, @dietaryPrefs, @allergies, @contactPhone, @contactEmail, @notes, @createdAt, @updatedAt)
  `);
  const reservedTableIds = [tables[0].id, tables[1].id];
  stmt.run({
    id: uuidv4(),
    userId: diningUsers[0].id,
    date: '2024-08-15',
    time: '19:00',
    partySize: 2,
    tableIds: JSON.stringify(reservedTableIds),
    status: 'CONFIRMED',
    dietaryPrefs: 'No shellfish',
    allergies: null,
    contactPhone: '+12025550123',
    contactEmail: 'guest@example.com',
    notes: 'Anniversary celebration',
    createdAt: now,
    updatedAt: now,
  });
  const updateSeatStatus = db.prepare(
    'UPDATE dining_tables SET status = @status, updatedAt = @updatedAt WHERE id = @id'
  );
  reservedTableIds.forEach((tableId) => {
    updateSeatStatus.run({ id: tableId, status: 'reserved', updatedAt: now });
  });
}

function main() {
  resetSchema();
  insertRoles();
  insertRolePermissions();
  insertUsers();
  insertEmployees();
  syncDiningUsersFromCore();
  insertRoomTypes();
  insertAmenities();
  insertSampleBookings();
  insertAmenityReservations();
  insertGuestInquiries();
  insertChatHistory();
  insertDiningTables();
  insertDiningMenu();
  insertDiningConfig();
  insertDiningStaff();
  insertDiningReservations();
  console.log('Database seeded with immersive Skyhaven data.');
}

main();
