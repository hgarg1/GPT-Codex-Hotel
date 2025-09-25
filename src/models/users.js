const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { sanitizeString } = require('../utils/sanitize');

// Demo users to explore Aurora Nexus Skyhaven. Passwords are bcrypt hashed at boot.
const demoUsers = [
  {
    id: uuidv4(),
    name: 'Astra Vega',
    email: 'astra@auroranexus.com',
    role: 'guest',
    passwordHash: bcrypt.hashSync('starlight123', 10),
    profile: {
      bio: 'Quantum botanist experiencing Aurora Nexus Skyhaven for inspiration.',
      phone: '+1-202-555-0111'
    }
  },
  {
    id: uuidv4(),
    name: 'Orion Kade',
    email: 'orion@auroranexus.com',
    role: 'guest',
    passwordHash: bcrypt.hashSync('cosmicwave!', 10),
    profile: {
      bio: 'Aerospace composer mapping stellar symphonies from the Skyhaven observatory.',
      phone: '+1-202-555-0174'
    }
  },
  {
    id: uuidv4(),
    name: 'Lyra Solace',
    email: 'lyra@auroranexus.com',
    role: 'admin',
    passwordHash: bcrypt.hashSync('adminpass123', 10),
    profile: {
      bio: 'Skyhaven curator ensuring every guest\'s orbit is seamless.',
      phone: '+1-202-555-0199'
    }
  }
];

function getAllUsers() {
  return demoUsers;
}

function getUserByEmail(email) {
  return demoUsers.find((user) => user.email.toLowerCase() === email.toLowerCase());
}

function getUserById(id) {
  return demoUsers.find((user) => user.id === id);
}

function createUser({ name, email, password }) {
  const normalisedEmail = sanitizeString(email).toLowerCase();
  if (getUserByEmail(normalisedEmail)) {
    const error = new Error('An account already exists for this email.');
    error.status = 409;
    throw error;
  }

  const user = {
    id: uuidv4(),
    name: sanitizeString(name),
    email: normalisedEmail,
    role: 'guest',
    passwordHash: bcrypt.hashSync(password, 10),
    profile: {
      bio: 'New Skyhaven explorer awaiting their first interstellar escape.',
      phone: ''
    }
  };

  demoUsers.push(user);
  return user;
}

function updateUserProfile(id, updates = {}) {
  const user = getUserById(id);
  if (!user) {
    const error = new Error('User not found.');
    error.status = 404;
    throw error;
  }

  user.name = sanitizeString(updates.name ?? user.name);
  user.profile.bio = sanitizeString(updates.bio ?? user.profile.bio);
  user.profile.phone = sanitizeString(updates.phone ?? user.profile.phone);
  return user;
}

module.exports = {
  getAllUsers,
  getUserByEmail,
  getUserById,
  createUser,
  updateUserProfile
};
