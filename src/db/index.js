const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let dbInstance;

function getDatabasePath() {
  return path.join(__dirname, '..', '..', 'data', 'hotel.db');
}

function getDb() {
  if (dbInstance) {
    return dbInstance;
  }
  const dbPath = getDatabasePath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  dbInstance = new Database(dbPath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');
  return dbInstance;
}

module.exports = {
  getDb,
  getDatabasePath
};
