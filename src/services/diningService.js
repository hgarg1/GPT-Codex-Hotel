const { getDb } = require('../db');
const {
  diningMenuSections,
  diningMenuItems,
  diningLeadership,
  diningStaff: fallbackStaffData,
  diningSeats: fallbackSeatData,
} = require('../data/dining');

let initialized = false;
let sqliteReady = false;

const fallbackCourseOrder = diningMenuSections.map((section) => section.key);

function centsToPrice(cents) {
  if (!Number.isFinite(cents)) {
    return null;
  }
  return Number((cents / 100).toFixed(2));
}

function cloneMenuItem(item) {
  return {
    id: item.id,
    name: item.name,
    course: item.course,
    priceCents: item.priceCents,
    price: centsToPrice(item.priceCents),
    tags: Array.isArray(item.tags) ? [...item.tags] : [],
    spiceLevel: item.spiceLevel ?? 0,
    description: item.description,
    hoverDetail: item.hoverDetail,
  };
}

const fallbackMenu = diningMenuItems.map(cloneMenuItem);
const fallbackLeadership = diningLeadership.map((person) => ({ ...person }));
const fallbackStaff = fallbackStaffData.map((member) => ({
  ...member,
  badges: Array.isArray(member.badges) ? [...member.badges] : [],
}));
const fallbackSeats = fallbackSeatData.map((seat) => ({ ...seat }));

async function initModels() {
  if (initialized) {
    return;
  }
  initialized = true;
  try {
    getDb();
    sqliteReady = true;
  } catch (error) {
    sqliteReady = false;
    console.warn('Dining service using fallback data. Reason:', error.message);
  }
}

function normalizeFilters({ dietary, spice, priceRange, course } = {}) {
  const parseList = (value) =>
    Array.isArray(value) ? value.filter(Boolean) : value ? [value] : [];
  const parsedDietary = parseList(dietary).map((value) => value.toLowerCase());
  const parsedSpice = parseList(spice).map((value) => Number(value));
  const parsedPrice = priceRange ? priceRange.split('-').map((value) => Number(value)) : [];
  const parsedCourse = parseList(course);
  return { parsedDietary, parsedSpice, parsedPrice, parsedCourse };
}

function filterMenuItems(items, { parsedDietary, parsedSpice, parsedPrice, parsedCourse }) {
  return items.filter((item) => {
    const tags = Array.isArray(item.tags) ? item.tags : [];
    const normalizedTags = tags.map((tag) => tag.toLowerCase());
    if (parsedDietary.length && !parsedDietary.every((tag) => normalizedTags.includes(tag))) {
      return false;
    }
    if (parsedSpice.length && !parsedSpice.includes(Number(item.spiceLevel ?? 0))) {
      return false;
    }
    if (parsedCourse.length && !parsedCourse.includes(item.course)) {
      return false;
    }
    if (parsedPrice.length === 2) {
      const [min, max] = parsedPrice;
      const price = Number.isFinite(item.price)
        ? item.price
        : Number.isFinite(item.priceCents)
        ? centsToPrice(item.priceCents)
        : null;
      if (!Number.isFinite(price) || price < min || price > max) {
        return false;
      }
    }
    return true;
  });
}

function groupMenuByCourse(items, courseOrder = fallbackCourseOrder) {
  const grouped = {};
  courseOrder.forEach((course) => {
    grouped[course] = [];
  });
  items.forEach((item) => {
    if (!grouped[item.course]) {
      grouped[item.course] = [];
    }
    grouped[item.course].push(item);
  });
  Object.keys(grouped).forEach((key) => {
    grouped[key].sort((a, b) => a.name.localeCompare(b.name));
  });
  return grouped;
}

function parseJsonArray(value) {
  if (typeof value !== 'string') {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function readMenuFromDatabase() {
  if (!sqliteReady) {
    return null;
  }
  try {
    const db = getDb();
    const sections = db
      .prepare('SELECT id, slug, title FROM dining_menu_sections ORDER BY "order" ASC')
      .all();
    if (!sections.length) {
      return null;
    }
    const sectionKeyById = new Map();
    const courseOrder = [];
    sections.forEach((section) => {
      const key = section.slug || section.key || section.title?.toLowerCase() || section.id;
      sectionKeyById.set(section.id, key);
      courseOrder.push(key);
    });
    const rows = db
      .prepare(
        `SELECT id, sectionId, name, description, priceCents, tags, spicyLevel, hoverDetail
         FROM dining_menu_items
         WHERE active = 1
         ORDER BY name ASC`
      )
      .all();
    if (!rows.length) {
      return null;
    }
    const items = rows.map((row) => {
      const course = sectionKeyById.get(row.sectionId) || 'misc';
      const priceCents = Number.isFinite(row.priceCents) ? row.priceCents : null;
      return {
        id: row.id,
        name: row.name,
        course,
        description: row.description,
        priceCents,
        price: centsToPrice(priceCents),
        tags: parseJsonArray(row.tags),
        spiceLevel: row.spicyLevel ?? 0,
        hoverDetail: row.hoverDetail,
      };
    });
    return { items, courseOrder };
  } catch (error) {
    console.warn('Falling back to static dining menu.', error.message);
    return null;
  }
}

async function getMenuByCourse(filters = {}) {
  const normalizedFilters = normalizeFilters(filters);
  const dbResult = readMenuFromDatabase();
  const items = dbResult?.items ?? fallbackMenu;
  const courseOrder = dbResult?.courseOrder ?? fallbackCourseOrder;
  const filtered = filterMenuItems(items, normalizedFilters).map(cloneMenuItem);
  return groupMenuByCourse(filtered, courseOrder);
}

function listLeadership() {
  return fallbackLeadership.map((leader) => ({ ...leader }));
}

function listStaff() {
  if (sqliteReady) {
    try {
      const rows = getDb()
        .prepare(
          'SELECT id, name, role, badges, nextShift FROM dining_staff WHERE active = 1 ORDER BY name ASC'
        )
        .all();
      if (rows.length) {
        return rows.map((row) => ({
          id: row.id,
          name: row.name,
          role: row.role,
          badges: parseJsonArray(row.badges),
          nextShift: row.nextShift || new Date().toISOString(),
        }));
      }
    } catch (error) {
      console.warn('Falling back to static dining staff.', error.message);
    }
  }
  return fallbackStaff.map((member) => ({
    ...member,
    badges: Array.isArray(member.badges) ? [...member.badges] : [],
  }));
}

function listSeats() {
  if (sqliteReady) {
    try {
      const rows = getDb()
        .prepare(
          'SELECT id, label, capacity, zone, status FROM dining_tables WHERE active = 1 ORDER BY label ASC'
        )
        .all();
      if (rows.length) {
        return rows.map((row) => ({
          id: row.id,
          label: row.label,
          capacity: row.capacity,
          zone: row.zone,
          status: row.status || 'available',
        }));
      }
    } catch (error) {
      console.warn('Falling back to static dining tables.', error.message);
    }
  }
  return fallbackSeats.map((seat) => ({ ...seat }));
}

module.exports = {
  initModels,
  getMenuByCourse,
  listLeadership,
  listStaff,
  listSeats,
};
