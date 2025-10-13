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
    description: 'Shaved beets, pistachio praline, Meyer lemon gel.',
    hoverDetail: 'Mountain beets are shaved tableside and kissed with smoked olive oil.'
  },
  {
    id: 'starter-2',
    name: 'Torched Hamachi Mosaic',
    course: 'starters',
    price: 24,
    tags: ['gluten-free'],
    spiceLevel: 2,
    description: 'Yuzu kosho, compressed cucumber, sesame tuile.',
    hoverDetail: 'Hamachi is line-caught in Hokkaido and finished with our in-house citrus ash.'
  },
  {
    id: 'starter-3',
    name: 'Charred Octopus Kintsugi',
    course: 'starters',
    price: 26,
    tags: ['gluten-free'],
    spiceLevel: 1,
    description: 'Coal-grilled octopus, miso caramel, finger lime pearls.',
    hoverDetail: 'Octopus is marinated 24 hours in koji before being seared over binchōtan coals.'
  },
  {
    id: 'starter-4',
    name: 'Snow Pea & Burrata Fresca',
    course: 'starters',
    price: 19,
    tags: ['vegetarian'],
    spiceLevel: 0,
    description: 'Fresh burrata, snap pea tendrils, basil cloud.',
    hoverDetail: 'Burrata arrives twice weekly from a micro-dairy and is plated within hours of delivery.'
  },
  {
    id: 'starter-5',
    name: 'Glacier Oyster Trio',
    course: 'starters',
    price: 23,
    tags: ['gluten-free'],
    spiceLevel: 2,
    description: 'Three varietals with spruce tip mignonette and trout roe.',
    hoverDetail: 'Each oyster is paired with a distinct spruce infusion to echo alpine aromatics.'
  },
  {
    id: 'main-1',
    name: 'Wagyu Striploin',
    course: 'mains',
    price: 64,
    tags: [],
    spiceLevel: 1,
    description: 'Charred onion soubise, truffle pomme purée.',
    hoverDetail: 'The striploin is A5 grade from Miyazaki, seared in brown butter for 45 seconds per side.'
  },
  {
    id: 'main-2',
    name: 'Black Garlic Cauliflower Steak',
    course: 'mains',
    price: 36,
    tags: ['vegan', 'gluten-free'],
    spiceLevel: 2,
    description: 'Harissa, preserved lemon, smoked almond cream.',
    hoverDetail: 'Cauliflower is lacquered in black garlic molasses then finished over the hearth.'
  },
  {
    id: 'main-3',
    name: 'Cedar-Smoked Salmon Fillet',
    course: 'mains',
    price: 42,
    tags: ['gluten-free'],
    spiceLevel: 1,
    description: 'Roasted roots, pine sap glaze, foraged chanterelles.',
    hoverDetail: 'Salmon is smoked in our open-fire hearth with hand-cut cedar planks from British Columbia.'
  },
  {
    id: 'main-4',
    name: 'Porcini Crusted Venison',
    course: 'mains',
    price: 58,
    tags: ['gluten-free'],
    spiceLevel: 2,
    description: 'Cocoa jus, black currant, juniper ash.',
    hoverDetail: 'Wild venison is dry-aged 14 days and dusted with porcini powder and cocoa nib.'
  },
  {
    id: 'main-5',
    name: 'Saffron Lobster Tagliatelle',
    course: 'mains',
    price: 49,
    tags: ['shellfish'],
    spiceLevel: 1,
    description: 'House-made saffron pasta, lobster coral butter, citrus zest.',
    hoverDetail: 'Pasta dough is infused with Iranian saffron and rolled to order for every seating.'
  },
  {
    id: 'dessert-1',
    name: '64% Chocolate Marquise',
    course: 'desserts',
    price: 19,
    tags: ['vegetarian'],
    spiceLevel: 0,
    description: 'Hazelnut praline, salted caramel, cocoa nib crunch.',
    hoverDetail: 'The marquise is poured into custom molds lined with tempered chocolate filigree.'
  },
  {
    id: 'dessert-2',
    name: 'Aurora Citrus Pavlova',
    course: 'desserts',
    price: 17,
    tags: ['gluten-free'],
    spiceLevel: 0,
    description: 'Citrus curd, grapefruit sorbet, candied fennel.',
    hoverDetail: 'Meringues are slow-dried for six hours to achieve the aurora-inspired swirls.'
  },
  {
    id: 'dessert-3',
    name: 'Midnight Sesame Soufflé',
    course: 'desserts',
    price: 18,
    tags: ['vegetarian'],
    spiceLevel: 1,
    description: 'Black sesame sponge, ginger anglaise, honeycomb.',
    hoverDetail: 'Soufflés are fired individually and whisked with freshly ground black sesame paste.'
  },
  {
    id: 'dessert-4',
    name: 'Frozen Garden Tisane',
    course: 'desserts',
    price: 16,
    tags: ['vegan', 'gluten-free'],
    spiceLevel: 0,
    description: 'Herbal granité, compressed melon, verbena bubbles.',
    hoverDetail: 'Verbena leaves are steeped tableside and poured over the granité for a cloud of aroma.'
  },
  {
    id: 'dessert-5',
    name: 'Caramelized Pear Mille-Feuille',
    course: 'desserts',
    price: 20,
    tags: ['vegetarian'],
    spiceLevel: 0,
    description: 'Vanilla bean custard, burnt honey, almond brittle.',
    hoverDetail: 'Each mille-feuille uses laminated pastry baked hourly for optimal shatter.'
  },
  {
    id: 'drink-1',
    name: 'Celestial Negroni',
    course: 'drinks',
    price: 21,
    tags: ['gluten-free'],
    spiceLevel: 1,
    description: 'Barrel-aged gin, cacao vermouth, amaro, orange oils.',
    hoverDetail: 'Finished with a flamed cacao mist expressed from the bar\'s rotovap.'
  },
  {
    id: 'drink-2',
    name: 'Alpenglow Spritz',
    course: 'drinks',
    price: 18,
    tags: ['gluten-free'],
    spiceLevel: 0,
    description: 'Sparkling rosé, mountain berry shrub, smoked thyme.',
    hoverDetail: 'Shrub berries are foraged from local alpine farms and macerated for 72 hours.'
  },
  {
    id: 'drink-3',
    name: 'Juniper Ember',
    course: 'drinks',
    price: 19,
    tags: ['gluten-free'],
    spiceLevel: 2,
    description: 'Smoked gin, charred citrus, ember bitters.',
    hoverDetail: 'The cocktail is smoked in a cedar cloche before arriving at the table.'
  },
  {
    id: 'drink-4',
    name: 'Crystal Garden Mocktail',
    course: 'drinks',
    price: 14,
    tags: ['gluten-free', 'vegan'],
    spiceLevel: 0,
    description: 'Seedlip grove, cucumber nectar, basil crystalline.',
    hoverDetail: 'Edible basil crystals are dehydrated in-house for each service.'
  },
  {
    id: 'drink-5',
    name: 'Spiced Chai Old Fashioned',
    course: 'drinks',
    price: 20,
    tags: ['gluten-free'],
    spiceLevel: 1,
    description: 'Single barrel bourbon, masala syrup, smoked vanilla.',
    hoverDetail: 'Bourbon is fat-washed with toasted coconut and paired with house chai bitters.'
  },
  {
    id: 'kids-1',
    name: 'Mini Garden Poke Bowl',
    course: 'kids',
    price: 12,
    tags: ['kids', 'gluten-free'],
    spiceLevel: 0,
    description: 'Marinated tofu, sushi rice, rainbow veggies, sweet soy drizzle.',
    hoverDetail: 'Rice is gently seasoned with apple cider vinegar to keep flavors bright for young palates.'
  },
  {
    id: 'kids-2',
    name: 'Sprout Slider Duo',
    course: 'kids',
    price: 11,
    tags: ['kids'],
    spiceLevel: 0,
    description: 'Grass-fed beef sliders, cheddar melt, soft milk buns.',
    hoverDetail: 'Sliders use a hidden carrot purée for extra sweetness and nutrients.'
  },
  {
    id: 'kids-3',
    name: 'Starlit Pasta Twirls',
    course: 'kids',
    price: 10,
    tags: ['kids', 'vegetarian'],
    spiceLevel: 0,
    description: 'Mini farfalle, roasted tomato sauce, parmesan snowfall.',
    hoverDetail: 'Tomatoes are slow-roasted with basil to deliver sweetness without heat.'
  },
  {
    id: 'kids-4',
    name: 'Aurora Chicken Bites',
    course: 'kids',
    price: 12,
    tags: ['kids', 'gluten-free'],
    spiceLevel: 0,
    description: 'Air-baked chicken, quinoa crust, honey herb dip.',
    hoverDetail: 'Chicken is brined in citrus and oven-baked for a crunchy crust without frying.'
  },
  {
    id: 'kids-5',
    name: 'Moonbeam Fruit Parfait',
    course: 'kids',
    price: 8,
    tags: ['kids', 'vegetarian', 'gluten-free'],
    spiceLevel: 0,
    description: 'Vanilla yogurt, berry constellations, granola clusters.',
    hoverDetail: 'Granola clusters are nut-free and toasted with maple syrup for gentle sweetness.'
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

function normalizeFilters({ dietary, spice, priceRange, course } = {}) {
  const parseList = (value) => (Array.isArray(value) ? value.filter(Boolean) : value ? [value] : []);
  const parsedDietary = parseList(dietary);
  const parsedSpice = parseList(spice).map((value) => Number(value));
  const parsedPrice = priceRange ? priceRange.split('-').map((value) => Number(value)) : [];
  const parsedCourse = parseList(course);
  return { parsedDietary, parsedSpice, parsedPrice, parsedCourse };
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
  const { parsedDietary, parsedSpice, parsedPrice, parsedCourse } = normalizeFilters(filters);
  return fallbackMenu.filter((item) => {
    if (parsedDietary.length && !parsedDietary.every((tag) => item.tags.includes(tag))) {
      return false;
    }
    if (parsedSpice.length && !parsedSpice.includes(item.spiceLevel)) {
      return false;
    }
    if (parsedCourse.length && !parsedCourse.includes(item.course)) {
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
      const { parsedDietary, parsedSpice, parsedPrice, parsedCourse } = normalizeFilters(filters);
      const where = { active: true };
      if (parsedDietary.length) {
        where.tags = { [Op.contains]: parsedDietary };
      }
      if (parsedSpice.length) {
        where.spiceLevel = parsedSpice;
      }
      if (parsedCourse.length) {
        where.course = { [Op.in]: parsedCourse };
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

module.exports = {
  initModels,
  getMenuByCourse,
  listLeadership,
  listStaff,
  listSeats
};
