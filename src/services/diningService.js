const { DataTypes, Op } = require('sequelize');
const { getSequelize } = require('../db/postgres');

let initialized = false;
let sequelizeReady = false;
let MenuItem;
let DiningReservation;
let DiningSeat;
let DiningStaff;

const fallbackMenu = [
  {
    id: 'starter-1',
    name: 'Golden Beet Carpaccio',
    course: 'starters',
    price: 18,
    tags: ['vegetarian', 'gluten-free'],
    spiceLevel: 1,
    description: 'Shaved beets, pistachio praline, Meyer lemon gel.'
  },
  {
    id: 'starter-2',
    name: 'Torched Hamachi Mosaic',
    course: 'starters',
    price: 24,
    tags: ['gluten-free'],
    spiceLevel: 2,
    description: 'Yuzu kosho, compressed cucumber, sesame tuile.'
  },
  {
    id: 'main-1',
    name: 'Wagyu Striploin',
    course: 'mains',
    price: 64,
    tags: [],
    spiceLevel: 1,
    description: 'Charred onion soubise, truffle pomme purée.'
  },
  {
    id: 'main-2',
    name: 'Black Garlic Cauliflower Steak',
    course: 'mains',
    price: 36,
    tags: ['vegan', 'gluten-free'],
    spiceLevel: 2,
    description: 'Harissa, preserved lemon, smoked almond cream.'
  },
  {
    id: 'dessert-1',
    name: '64% Chocolate Marquise',
    course: 'desserts',
    price: 19,
    tags: ['vegetarian'],
    spiceLevel: 0,
    description: 'Hazelnut praline, salted caramel, cocoa nib crunch.'
  },
  {
    id: 'drink-1',
    name: 'Celestial Negroni',
    course: 'drinks',
    price: 21,
    tags: ['gluten-free'],
    spiceLevel: 1,
    description: 'Barrel-aged gin, cacao vermouth, amaro, orange oils.'
  }
];

const fallbackLeadership = [
  {
    id: 'dir-1',
    name: 'Isabella Marchetti',
    title: 'Director of Culinary Experiences',
    focus: 'Vision & Guest Journey',
    bio: 'Former Michelin-starred GM bringing theatrical dining to Skyhaven.',
    photo: '/images/dining/leadership/isabella.jpg'
  },
  {
    id: 'chef-1',
    name: 'Kenji Nakamoto',
    title: 'Executive Chef',
    focus: 'Modern kaiseki-inspired tasting menus',
    bio: 'Sourced from Kyoto, blending precision with seasonal Rocky Mountain ingredients.',
    photo: '/images/dining/leadership/kenji.jpg'
  },
  {
    id: 'pastry-1',
    name: 'Aurora Chen',
    title: 'Pastry Chef',
    focus: 'Edible art installations',
    bio: 'Inventor of the luminescent pavlova series and a lifelong chocolate sculptor.',
    photo: '/images/dining/leadership/aurora.jpg'
  },
  {
    id: 'som-1',
    name: 'Thierry Dubois',
    title: 'Head Sommelier',
    focus: 'Rare allocations & tableside storytelling',
    bio: 'Certified Master Sommelier specializing in biodynamic pairings.',
    photo: '/images/dining/leadership/thierry.jpg'
  },
  {
    id: 'foh-1',
    name: 'Sasha Patel',
    title: 'Front of House Director',
    focus: 'Service choreography',
    bio: 'Leads a synchronized team delivering choreographed service cues.',
    photo: '/images/dining/leadership/sasha.jpg'
  },
  {
    id: 'boh-1',
    name: 'Luis Romero',
    title: 'Back of House Director',
    focus: 'Culinary operations',
    bio: 'Drives mise-en-place precision and nightly kitchen briefings.',
    photo: '/images/dining/leadership/luis.jpg'
  }
];

const fallbackStaff = [
  {
    id: 'staff-1',
    name: 'Rowan Lee',
    role: 'Captain',
    badges: ['Lead Service', 'Wine Studio'],
    nextShift: '2024-07-01T17:00:00Z'
  },
  {
    id: 'staff-2',
    name: 'Emilia Hart',
    role: 'Pastry Sous Chef',
    badges: ['Sugar Artist'],
    nextShift: '2024-07-01T15:00:00Z'
  },
  {
    id: 'staff-3',
    name: 'Malik Carter',
    role: 'Sommelier',
    badges: ['Spirits Curator'],
    nextShift: '2024-07-02T17:00:00Z'
  }
];

const fallbackSeats = [
  { id: 'A1', label: 'A1', capacity: 2, zone: 'Atrium', status: 'available' },
  { id: 'A2', label: 'A2', capacity: 2, zone: 'Atrium', status: 'available' },
  { id: 'A3', label: 'A3', capacity: 4, zone: 'Atrium', status: 'held' },
  { id: 'B1', label: 'B1', capacity: 6, zone: 'Garden', status: 'reserved' },
  { id: 'B2', label: 'B2', capacity: 4, zone: 'Garden', status: 'available' },
  { id: 'C1', label: 'C1', capacity: 2, zone: 'Chef\'s Counter', status: 'available' }
];

async function initModels() {
  if (initialized) {
    return;
  }
  initialized = true;

  try {
    const sequelize = getSequelize();

    MenuItem = sequelize.define(
      'DiningMenuItem',
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        name: DataTypes.STRING,
        description: DataTypes.TEXT,
        course: DataTypes.STRING,
        price: DataTypes.FLOAT,
        tags: {
          type: DataTypes.ARRAY(DataTypes.STRING),
          allowNull: false,
          defaultValue: []
        },
        spiceLevel: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0
        },
        active: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true
        }
      },
      {
        tableName: 'dining_menu_items',
        timestamps: true
      }
    );

    DiningReservation = sequelize.define(
      'DiningReservation',
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        userId: DataTypes.STRING,
        diningDate: DataTypes.DATE,
        partySize: DataTypes.INTEGER,
        seatIds: {
          type: DataTypes.ARRAY(DataTypes.STRING),
          defaultValue: []
        },
        dietaryNotes: DataTypes.TEXT,
        contactPhone: DataTypes.STRING,
        specialRequests: DataTypes.TEXT,
        status: {
          type: DataTypes.STRING,
          defaultValue: 'pending'
        },
        depositAmount: {
          type: DataTypes.FLOAT,
          defaultValue: 0
        }
      },
      {
        tableName: 'dining_reservations',
        timestamps: true
      }
    );

    DiningSeat = sequelize.define(
      'DiningSeat',
      {
        id: {
          type: DataTypes.STRING,
          primaryKey: true
        },
        label: DataTypes.STRING,
        capacity: DataTypes.INTEGER,
        zone: DataTypes.STRING,
        status: DataTypes.STRING
      },
      {
        tableName: 'dining_seats',
        timestamps: true
      }
    );

    DiningStaff = sequelize.define(
      'DiningStaff',
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        name: DataTypes.STRING,
        role: DataTypes.STRING,
        badges: {
          type: DataTypes.ARRAY(DataTypes.STRING),
          defaultValue: []
        },
        nextShift: DataTypes.DATE,
        bio: DataTypes.TEXT,
        headshotUrl: DataTypes.STRING
      },
      {
        tableName: 'dining_staff',
        timestamps: true
      }
    );

    await sequelize.sync({ alter: false });
    sequelizeReady = true;
  } catch (error) {
    console.warn('Dining models falling back to in-memory data. Reason:', error.message);
    sequelizeReady = false;
  }
}

function normalizeFilters({ dietary, spice, priceRange } = {}) {
  const parseList = (value) => (Array.isArray(value) ? value.filter(Boolean) : value ? [value] : []);
  const parsedDietary = parseList(dietary);
  const parsedSpice = parseList(spice).map((value) => Number(value));
  const parsedPrice = priceRange ? priceRange.split('-').map((value) => Number(value)) : [];
  return { parsedDietary, parsedSpice, parsedPrice };
}

function groupMenuByCourse(items) {
  return items.reduce((acc, item) => {
    const bucket = acc[item.course] || [];
    bucket.push(item);
    acc[item.course] = bucket;
    return acc;
  }, {});
}

function filterFallbackMenu(filters) {
  const { parsedDietary, parsedSpice, parsedPrice } = normalizeFilters(filters);
  return fallbackMenu.filter((item) => {
    if (parsedDietary.length && !parsedDietary.every((tag) => item.tags.includes(tag))) {
      return false;
    }
    if (parsedSpice.length && !parsedSpice.includes(item.spiceLevel)) {
      return false;
    }
    if (parsedPrice.length === 2) {
      const [min, max] = parsedPrice;
      if (item.price < min || item.price > max) {
        return false;
      }
    }
    return true;
  });
}

async function getMenuByCourse(filters = {}) {
  if (sequelizeReady && MenuItem) {
    try {
      const { parsedDietary, parsedSpice, parsedPrice } = normalizeFilters(filters);
      const where = { active: true };
      if (parsedDietary.length) {
        where.tags = { [Op.contains]: parsedDietary };
      }
      if (parsedSpice.length) {
        where.spiceLevel = parsedSpice;
      }
      if (parsedPrice.length === 2) {
        where.price = { [Op.between]: parsedPrice };
      }
      const items = await MenuItem.findAll({
        where,
        order: [
          ['course', 'ASC'],
          ['name', 'ASC']
        ]
      });
      const plainItems = items.map((item) => item.toJSON());
      return groupMenuByCourse(plainItems);
    } catch (error) {
      console.warn('Falling back to static dining menu.', error.message);
    }
  }
  const filtered = filterFallbackMenu(filters);
  return groupMenuByCourse(filtered);
}

function listLeadership() {
  return fallbackLeadership;
}

function listStaff() {
  return fallbackStaff;
}

function listSeats() {
  return fallbackSeats;
}

function listReservationsForUser(userId) {
  if (!userId) return [];
  return [
    {
      id: 'res-1',
      diningDate: '2024-07-01T19:00:00Z',
      partySize: 2,
      seatIds: ['A1', 'A2'],
      status: 'confirmed',
      depositAmount: 50,
      dietaryNotes: 'No shellfish'
    },
    {
      id: 'res-2',
      diningDate: '2024-08-15T21:00:00Z',
      partySize: 4,
      seatIds: ['C1'],
      status: 'pending',
      depositAmount: 0,
      dietaryNotes: 'Celebrating anniversary'
    }
  ];
}

module.exports = {
  initModels,
  getMenuByCourse,
  listLeadership,
  listStaff,
  listSeats,
  listReservationsForUser
};
