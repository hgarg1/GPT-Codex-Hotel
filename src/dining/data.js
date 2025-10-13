const crypto = require('node:crypto');
const { getDb } = require('../db');

function db() {
  return getDb();
}

function nowIso() {
  return new Date().toISOString();
}

function mapTable(row) {
  return {
    id: row.id,
    label: row.label,
    capacity: Number(row.capacity),
    x: Number(row.x),
    y: Number(row.y),
    rotation: Number(row.rotation),
    zone: row.zone ?? null,
    active: Boolean(row.active),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function parseTableIds(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((value) => String(value));
    }
    return [];
  } catch (error) {
    console.warn('Failed to parse dining tableIds payload', error);
    return [];
  }
}

function serializeTableIds(tableIds) {
  if (!Array.isArray(tableIds)) {
    return '[]';
  }
  return JSON.stringify(tableIds.map((value) => String(value)));
}

function mapUser(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.userId ?? row.id,
    email: row.userEmail ?? row.email,
    name: row.userName ?? row.name ?? null,
    phone: row.userPhone ?? row.phone ?? null,
    createdAt: new Date(row.userCreatedAt ?? row.createdAt ?? nowIso()),
    updatedAt: new Date(row.userUpdatedAt ?? row.updatedAt ?? nowIso()),
  };
}

function mapReservation(row) {
  const dateValue = row.date ? String(row.date) : '';
  const isoDate = dateValue.length > 10 ? dateValue : `${dateValue}T00:00:00.000Z`;
  return {
    id: row.id,
    userId: row.userId,
    date: new Date(isoDate),
    time: row.time,
    partySize: Number(row.partySize),
    tableIds: parseTableIds(row.tableIds),
    status: row.status,
    dietaryPrefs: row.dietaryPrefs ?? null,
    allergies: row.allergies ?? null,
    contactPhone: row.contactPhone ?? null,
    contactEmail: row.contactEmail ?? null,
    notes: row.notes ?? null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    user: row.userEmail || row.userName || row.userPhone ? mapUser(row) : null,
  };
}

function mapMenuItem(row) {
  return {
    id: row.id,
    sectionId: row.sectionId,
    name: row.name,
    description: row.description ?? null,
    priceCents: Number(row.priceCents),
    vegetarian: Boolean(row.vegetarian),
    vegan: Boolean(row.vegan),
    glutenFree: Boolean(row.glutenFree),
    spicyLevel: Number(row.spicyLevel),
    active: Boolean(row.active),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function mapMenuSection(row, items) {
  return {
    id: row.id,
    title: row.title,
    order: Number(row.order),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    items,
  };
}

function mapConfig(row) {
  return {
    id: row.id,
    dwellMinutes: Number(row.dwellMinutes),
    blackoutDates: row.blackoutDates ? JSON.parse(row.blackoutDates) : [],
    policyText: row.policyText ?? null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

async function ensureDiningUserRecord(user) {
  if (!user || !user.id || !user.email) {
    return;
  }
  const database = db();
  const now = nowIso();
  database
    .prepare(
      `INSERT INTO dining_users (id, email, name, phone, createdAt, updatedAt)
       VALUES (@id, @email, @name, @phone, @createdAt, @updatedAt)
       ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name, phone = excluded.phone, updatedAt = excluded.updatedAt`,
    )
    .run({
      id: user.id,
      email: user.email,
      name: user.name ?? null,
      phone: user.phone ?? null,
      createdAt: now,
      updatedAt: now,
    });
}

async function listAdminReservations(filters = {}) {
  const database = db();
  const conditions = [];
  const params = {};
  if (filters.status) {
    conditions.push('r.status = @status');
    params.status = filters.status;
  }
  if (filters.date) {
    conditions.push('r.date = @date');
    params.date = filters.date;
  }
  if (filters.time) {
    conditions.push('r.time = @time');
    params.time = filters.time;
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = database
    .prepare(
      `SELECT r.*, u.email AS userEmail, u.name AS userName, u.phone AS userPhone, u.createdAt AS userCreatedAt, u.updatedAt AS userUpdatedAt
       FROM dining_reservations r
       LEFT JOIN dining_users u ON u.id = r.userId
       ${whereClause}
       ORDER BY r.date DESC, r.time ASC`,
    )
    .all(params);
  return rows.map(mapReservation);
}

async function listReservationsBetween(startDate, endDate) {
  const database = db();
  const rows = database
    .prepare(
      `SELECT r.*, u.email AS userEmail, u.name AS userName, u.phone AS userPhone, u.createdAt AS userCreatedAt, u.updatedAt AS userUpdatedAt
       FROM dining_reservations r
       LEFT JOIN dining_users u ON u.id = r.userId
       WHERE r.date >= @startDate AND r.date <= @endDate
       ORDER BY r.date ASC, r.time ASC`,
    )
    .all({ startDate, endDate });
  return rows.map(mapReservation);
}

async function listTables(options = {}) {
  const database = db();
  const conditions = [];
  const params = {};
  if (options.activeOnly) {
    conditions.push('active = 1');
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = database
    .prepare(
      `SELECT id, label, capacity, x, y, rotation, zone, active, createdAt, updatedAt
       FROM dining_tables
       ${whereClause}
       ORDER BY label ASC`,
    )
    .all(params);
  return rows.map(mapTable);
}

async function getTablesByIds(tableIds) {
  if (!Array.isArray(tableIds) || tableIds.length === 0) {
    return [];
  }
  const database = db();
  const unique = [...new Set(tableIds.map((value) => String(value)))];
  const placeholders = unique.map(() => '?').join(', ');
  const rows = database
    .prepare(
      `SELECT id, label, capacity, x, y, rotation, zone, active, createdAt, updatedAt
       FROM dining_tables
       WHERE id IN (${placeholders})`,
    )
    .all(unique);
  const tableMap = new Map(rows.map((row) => [row.id, mapTable(row)]));
  return unique.map((id) => tableMap.get(id)).filter(Boolean);
}

async function createDiningTable(data) {
  const database = db();
  const id = data.id ?? crypto.randomUUID();
  const now = nowIso();
  database
    .prepare(
      `INSERT INTO dining_tables (id, label, capacity, x, y, rotation, zone, active, createdAt, updatedAt)
       VALUES (@id, @label, @capacity, @x, @y, @rotation, @zone, @active, @createdAt, @updatedAt)`,
    )
    .run({
      id,
      label: data.label,
      capacity: data.capacity,
      x: data.x,
      y: data.y,
      rotation: data.rotation ?? 0,
      zone: data.zone ?? null,
      active: data.active ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    });
  const row = database
    .prepare(
      `SELECT id, label, capacity, x, y, rotation, zone, active, createdAt, updatedAt FROM dining_tables WHERE id = ? LIMIT 1`,
    )
    .get(id);
  return mapTable(row);
}

async function updateDiningTables(updates) {
  if (!Array.isArray(updates) || updates.length === 0) {
    return [];
  }
  const database = db();
  const selectStmt = database.prepare(
    `SELECT id, label, capacity, x, y, rotation, zone, active, createdAt, updatedAt FROM dining_tables WHERE id = ? LIMIT 1`,
  );
  const transaction = database.transaction((payloads) => {
    const results = [];
    payloads.forEach((payload) => {
      if (!payload.id) {
        throw new Error('Missing table id');
      }
      const fields = [];
      const params = { id: payload.id };
      if (payload.label !== undefined) {
        fields.push('label = @label');
        params.label = payload.label;
      }
      if (payload.capacity !== undefined) {
        fields.push('capacity = @capacity');
        params.capacity = payload.capacity;
      }
      if (payload.x !== undefined) {
        fields.push('x = @x');
        params.x = payload.x;
      }
      if (payload.y !== undefined) {
        fields.push('y = @y');
        params.y = payload.y;
      }
      if (payload.rotation !== undefined) {
        fields.push('rotation = @rotation');
        params.rotation = payload.rotation;
      }
      if (payload.zone !== undefined) {
        fields.push('zone = @zone');
        params.zone = payload.zone;
      }
      if (payload.active !== undefined) {
        fields.push('active = @active');
        params.active = payload.active ? 1 : 0;
      }
      if (fields.length === 0) {
        throw new Error('No updatable fields provided');
      }
      fields.push('updatedAt = @updatedAt');
      params.updatedAt = nowIso();
      database.prepare(`UPDATE dining_tables SET ${fields.join(', ')} WHERE id = @id`).run(params);
      const updated = selectStmt.get(payload.id);
      if (!updated) {
        throw new Error('Dining table not found');
      }
      results.push(mapTable(updated));
    });
    return results;
  });
  return transaction(updates);
}

async function listMenuSections(options = {}) {
  const database = db();
  const sectionRows = database
    .prepare(
      `SELECT id, title, "order", createdAt, updatedAt FROM dining_menu_sections ORDER BY "order" ASC, title ASC`,
    )
    .all();
  if (sectionRows.length === 0) {
    return [];
  }
  const sectionIds = sectionRows.map((row) => row.id);
  const placeholders = sectionIds.map(() => '?').join(', ');
  const itemQuery = options.includeInactiveItems
    ? `SELECT * FROM dining_menu_items WHERE sectionId IN (${placeholders}) ORDER BY name ASC`
    : `SELECT * FROM dining_menu_items WHERE sectionId IN (${placeholders}) AND active = 1 ORDER BY name ASC`;
  const itemRows = database.prepare(itemQuery).all(sectionIds);
  const grouped = new Map(sectionIds.map((id) => [id, []]));
  itemRows.forEach((row) => {
    const item = mapMenuItem(row);
    const list = grouped.get(item.sectionId);
    if (list) {
      list.push(item);
    }
  });
  return sectionRows.map((row) => mapMenuSection(row, grouped.get(row.id) ?? []));
}

async function createMenuSection(data) {
  const database = db();
  const id = data.id ?? crypto.randomUUID();
  const now = nowIso();
  database
    .prepare(
      `INSERT INTO dining_menu_sections (id, title, "order", createdAt, updatedAt)
       VALUES (@id, @title, @order, @createdAt, @updatedAt)`,
    )
    .run({
      id,
      title: data.title,
      order: data.order ?? 0,
      createdAt: now,
      updatedAt: now,
    });
  const row = database
    .prepare(
      `SELECT id, title, "order", createdAt, updatedAt FROM dining_menu_sections WHERE id = ? LIMIT 1`,
    )
    .get(id);
  return mapMenuSection(row, []);
}

async function createMenuItem(data) {
  const database = db();
  const id = data.id ?? crypto.randomUUID();
  const now = nowIso();
  database
    .prepare(
      `INSERT INTO dining_menu_items (id, sectionId, name, description, priceCents, vegetarian, vegan, glutenFree, spicyLevel, active, createdAt, updatedAt)
       VALUES (@id, @sectionId, @name, @description, @priceCents, @vegetarian, @vegan, @glutenFree, @spicyLevel, @active, @createdAt, @updatedAt)`,
    )
    .run({
      id,
      sectionId: data.sectionId,
      name: data.name,
      description: data.description ?? null,
      priceCents: data.priceCents,
      vegetarian: data.vegetarian ? 1 : 0,
      vegan: data.vegan ? 1 : 0,
      glutenFree: data.glutenFree ? 1 : 0,
      spicyLevel: data.spicyLevel ?? 0,
      active: data.active ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    });
  const row = database
    .prepare(`SELECT * FROM dining_menu_items WHERE id = ? LIMIT 1`)
    .get(id);
  return mapMenuItem(row);
}

async function updateMenuSection(id, data) {
  const database = db();
  const fields = [];
  const params = { id };
  if (data.title !== undefined) {
    fields.push('title = @title');
    params.title = data.title;
  }
  if (data.order !== undefined) {
    fields.push('"order" = @order');
    params.order = data.order;
  }
  if (fields.length === 0) {
    throw new Error('No updates provided');
  }
  fields.push('updatedAt = @updatedAt');
  params.updatedAt = nowIso();
  database.prepare(`UPDATE dining_menu_sections SET ${fields.join(', ')} WHERE id = @id`).run(params);
  const row = database
    .prepare(`SELECT id, title, "order", createdAt, updatedAt FROM dining_menu_sections WHERE id = ? LIMIT 1`)
    .get(id);
  if (!row) {
    throw new Error('Menu section not found');
  }
  const items = await listMenuItemsForSection(id, { includeInactive: true });
  return mapMenuSection(row, items);
}

async function listMenuItemsForSection(sectionId, options = {}) {
  const database = db();
  const query = options.includeInactive
    ? `SELECT * FROM dining_menu_items WHERE sectionId = ? ORDER BY name ASC`
    : `SELECT * FROM dining_menu_items WHERE sectionId = ? AND active = 1 ORDER BY name ASC`;
  const rows = database.prepare(query).all(sectionId);
  return rows.map(mapMenuItem);
}

async function updateMenuItem(id, data) {
  const database = db();
  const fields = [];
  const params = { id };
  if (data.name !== undefined) {
    fields.push('name = @name');
    params.name = data.name;
  }
  if (data.description !== undefined) {
    fields.push('description = @description');
    params.description = data.description ?? null;
  }
  if (data.priceCents !== undefined) {
    fields.push('priceCents = @priceCents');
    params.priceCents = data.priceCents;
  }
  if (data.vegetarian !== undefined) {
    fields.push('vegetarian = @vegetarian');
    params.vegetarian = data.vegetarian ? 1 : 0;
  }
  if (data.vegan !== undefined) {
    fields.push('vegan = @vegan');
    params.vegan = data.vegan ? 1 : 0;
  }
  if (data.glutenFree !== undefined) {
    fields.push('glutenFree = @glutenFree');
    params.glutenFree = data.glutenFree ? 1 : 0;
  }
  if (data.spicyLevel !== undefined) {
    fields.push('spicyLevel = @spicyLevel');
    params.spicyLevel = data.spicyLevel;
  }
  if (data.active !== undefined) {
    fields.push('active = @active');
    params.active = data.active ? 1 : 0;
  }
  if (fields.length === 0) {
    throw new Error('No updates provided');
  }
  fields.push('updatedAt = @updatedAt');
  params.updatedAt = nowIso();
  database.prepare(`UPDATE dining_menu_items SET ${fields.join(', ')} WHERE id = @id`).run(params);
  const row = database.prepare(`SELECT * FROM dining_menu_items WHERE id = ? LIMIT 1`).get(id);
  if (!row) {
    throw new Error('Menu item not found');
  }
  return mapMenuItem(row);
}

async function deleteMenuSection(id) {
  const database = db();
  database.prepare('DELETE FROM dining_menu_sections WHERE id = ?').run(id);
}

async function deleteMenuItem(id) {
  const database = db();
  database.prepare('DELETE FROM dining_menu_items WHERE id = ?').run(id);
}

async function loadDiningConfig() {
  const database = db();
  const row = database.prepare('SELECT * FROM dining_config WHERE id = ? LIMIT 1').get('default');
  if (row) {
    return mapConfig(row);
  }
  const now = nowIso();
  database
    .prepare(
      `INSERT INTO dining_config (id, dwellMinutes, blackoutDates, policyText, createdAt, updatedAt)
       VALUES ('default', 120, '[]', NULL, @createdAt, @updatedAt)`,
    )
    .run({ createdAt: now, updatedAt: now });
  const created = database.prepare('SELECT * FROM dining_config WHERE id = ? LIMIT 1').get('default');
  return mapConfig(created);
}

async function updateDiningConfig(data) {
  const database = db();
  const now = nowIso();
  const blackout = Array.isArray(data.blackoutDates) ? JSON.stringify(data.blackoutDates) : '[]';
  database
    .prepare(
      `UPDATE dining_config
       SET dwellMinutes = @dwellMinutes,
           blackoutDates = @blackoutDates,
           policyText = @policyText,
           updatedAt = @updatedAt
       WHERE id = 'default'`,
    )
    .run({
      dwellMinutes: data.dwellMinutes,
      blackoutDates: blackout,
      policyText: data.policyText ?? null,
      updatedAt: now,
    });
  const row = database.prepare('SELECT * FROM dining_config WHERE id = ? LIMIT 1').get('default');
  return mapConfig(row);
}

async function listReservationsForDate(date, options = {}) {
  const database = db();
  const params = { date };
  const includeCancelled = options.includeCancelled ? '' : " AND status != 'CANCELLED'";
  const rows = database
    .prepare(
      `SELECT * FROM dining_reservations WHERE date = @date${includeCancelled} ORDER BY time ASC`,
    )
    .all(params);
  return rows.map(mapReservation);
}

async function listReservationsForSlot(date, time, options = {}) {
  const database = db();
  const params = { date, time };
  const includeCancelled = options.includeCancelled ? '' : " AND status != 'CANCELLED'";
  const rows = database
    .prepare(
      `SELECT * FROM dining_reservations WHERE date = @date AND time = @time${includeCancelled} ORDER BY createdAt ASC`,
    )
    .all(params);
  return rows.map(mapReservation);
}

async function createReservation(data) {
  const database = db();
  const id = data.id ?? crypto.randomUUID();
  const now = nowIso();
  database
    .prepare(
      `INSERT INTO dining_reservations (id, userId, date, time, partySize, tableIds, status, dietaryPrefs, allergies, contactPhone, contactEmail, notes, createdAt, updatedAt)
       VALUES (@id, @userId, @date, @time, @partySize, @tableIds, @status, @dietaryPrefs, @allergies, @contactPhone, @contactEmail, @notes, @createdAt, @updatedAt)`,
    )
    .run({
      id,
      userId: data.userId,
      date: data.date,
      time: data.time,
      partySize: data.partySize,
      tableIds: serializeTableIds(data.tableIds),
      status: data.status ?? 'CONFIRMED',
      dietaryPrefs: data.dietaryPrefs ?? null,
      allergies: data.allergies ?? null,
      contactPhone: data.contactPhone ?? null,
      contactEmail: data.contactEmail ?? null,
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
    });
  return getReservationById(id);
}

async function listReservationsForUser(userId) {
  if (!userId) {
    return [];
  }
  const database = db();
  const rows = database
    .prepare(
      `SELECT * FROM dining_reservations WHERE userId = @userId ORDER BY date ASC, time ASC`,
    )
    .all({ userId });
  return rows.map(mapReservation);
}

async function getReservationById(id) {
  const database = db();
  const row = database.prepare('SELECT * FROM dining_reservations WHERE id = ? LIMIT 1').get(id);
  if (!row) {
    return null;
  }
  return mapReservation(row);
}

async function updateReservation(id, data) {
  const database = db();
  const fields = [];
  const params = { id };
  if (data.date !== undefined) {
    fields.push('date = @date');
    params.date = data.date;
  }
  if (data.time !== undefined) {
    fields.push('time = @time');
    params.time = data.time;
  }
  if (data.partySize !== undefined) {
    fields.push('partySize = @partySize');
    params.partySize = data.partySize;
  }
  if (data.tableIds !== undefined) {
    fields.push('tableIds = @tableIds');
    params.tableIds = serializeTableIds(data.tableIds);
  }
  if (data.status !== undefined) {
    fields.push('status = @status');
    params.status = data.status;
  }
  if (data.dietaryPrefs !== undefined) {
    fields.push('dietaryPrefs = @dietaryPrefs');
    params.dietaryPrefs = data.dietaryPrefs ?? null;
  }
  if (data.allergies !== undefined) {
    fields.push('allergies = @allergies');
    params.allergies = data.allergies ?? null;
  }
  if (data.contactPhone !== undefined) {
    fields.push('contactPhone = @contactPhone');
    params.contactPhone = data.contactPhone ?? null;
  }
  if (data.contactEmail !== undefined) {
    fields.push('contactEmail = @contactEmail');
    params.contactEmail = data.contactEmail ?? null;
  }
  if (data.notes !== undefined) {
    fields.push('notes = @notes');
    params.notes = data.notes ?? null;
  }
  if (fields.length === 0) {
    return getReservationById(id);
  }
  fields.push('updatedAt = @updatedAt');
  params.updatedAt = nowIso();
  database.prepare(`UPDATE dining_reservations SET ${fields.join(', ')} WHERE id = @id`).run(params);
  return getReservationById(id);
}

module.exports = {
  ensureDiningUserRecord,
  listAdminReservations,
  listReservationsBetween,
  listTables,
  getTablesByIds,
  createDiningTable,
  updateDiningTables,
  listMenuSections,
  createMenuSection,
  createMenuItem,
  updateMenuSection,
  updateMenuItem,
  deleteMenuSection,
  deleteMenuItem,
  loadDiningConfig,
  updateDiningConfig,
  listReservationsForDate,
  listReservationsForSlot,
  createReservation,
  listReservationsForUser,
  getReservationById,
  updateReservation,
};
