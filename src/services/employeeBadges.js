const jwt = require('jsonwebtoken');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { DEFAULT_JWT_SECRET } = require('../utils/jwtDefaults');
const { normalizeRole } = require('../utils/rbac');

const db = getDb();

db.prepare(`
  CREATE TABLE IF NOT EXISTS employee_badge_scans (
    id TEXT PRIMARY KEY,
    employeeId TEXT NOT NULL,
    badgeId TEXT NOT NULL,
    tokenId TEXT NOT NULL,
    scannedAt TEXT NOT NULL,
    ipAddress TEXT,
    userAgent TEXT,
    FOREIGN KEY (employeeId) REFERENCES users(id) ON DELETE CASCADE
  )
`).run();

const badgeCache = new Map();

function getBadgeSigningKey() {
  if (process.env.BADGE_JWT_SECRET) {
    return process.env.BADGE_JWT_SECRET;
  }
  return DEFAULT_JWT_SECRET;
}

function getBadgeTtlMinutes() {
  const raw = process.env.BADGE_TOKEN_TTL_MINUTES;
  const parsed = raw ? Number.parseInt(raw, 10) : null;
  if (parsed && parsed > 5) {
    return parsed;
  }
  return 60 * 24; // default 24h
}

function signBadgeToken(employeeId, badgeId) {
  const secret = getBadgeSigningKey();
  const ttlMinutes = getBadgeTtlMinutes();
  const expiresIn = `${ttlMinutes}m`;
  const payload = {
    sub: employeeId,
    badgeId,
    type: 'badge'
  };
  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
    expiresIn,
    issuer: 'skyhaven-badge',
    audience: 'skyhaven-employee'
  });
}

function verifyBadgeToken(token) {
  if (!token) {
    const error = new Error('Missing badge token');
    error.code = 'BADGE_TOKEN_MISSING';
    throw error;
  }
  try {
    const decoded = jwt.verify(token, getBadgeSigningKey(), {
      algorithms: ['HS256'],
      issuer: 'skyhaven-badge',
      audience: 'skyhaven-employee'
    });
    return decoded;
  } catch (error) {
    error.code = 'BADGE_TOKEN_INVALID';
    throw error;
  }
}

async function buildQrData(url) {
  return QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 256 });
}

function buildVerifyUrl(baseUrl, token) {
  const trimmedBase = (baseUrl || '').replace(/\/$/, '');
  return `${trimmedBase}/api/employee/badge/verify?token=${encodeURIComponent(token)}`;
}

async function renderBadgePdf({ employee, verifyUrl, badgeId, token }) {
  const doc = new PDFDocument({ size: 'A7', margin: 18 });
  const buffers = [];
  doc.on('data', (chunk) => buffers.push(chunk));
  const completion = new Promise((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(buffers)));
  });

  const gradientHeight = 60;
  doc.rect(0, 0, doc.page.width, doc.page.height).fill('#0f172a');
  doc.save();
  const gradientStart = doc.page.height - gradientHeight;
  doc.rect(0, gradientStart, doc.page.width, gradientHeight).fill('#082f49');
  doc.restore();

  doc.fillColor('#e0f2fe');
  doc.fontSize(10).text('Aurora Nexus Skyhaven', { align: 'left' });
  doc.moveDown(0.4);
  doc.fontSize(16).fillColor('#38bdf8').text(employee.name, { align: 'left', lineGap: 2 });
  const roleLabel = normalizeRole(employee.role || 'EMPLOYEE');
  doc.fontSize(11).fillColor('#e0f2fe').text(roleLabel, { align: 'left' });
  if (employee.department) {
    doc.fontSize(9).fillColor('#bae6fd').text(employee.department, { align: 'left' });
  }

  const qrDataUrl = await buildQrData(verifyUrl);
  const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');
  const qrSize = 110;
  const qrX = doc.page.width - qrSize - 14;
  const qrY = doc.page.height - qrSize - 14;
  doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });

  doc.roundedRect(14, doc.page.height - 40, 80, 24, 6).fillAndStroke('#0ea5e9', '#38bdf8');
  doc.fillColor('#0f172a').fontSize(11).text('BADGE', 14, doc.page.height - 36, {
    width: 80,
    align: 'center'
  });

  doc.fontSize(7).fillColor('#bae6fd').text(`Badge ID: ${badgeId}`, 14, doc.page.height - 12);

  doc.end();
  return completion;
}

function recordBadgeScan({ employeeId, badgeId, tokenId, ipAddress, userAgent }) {
  const record = {
    id: uuidv4(),
    employeeId,
    badgeId,
    tokenId,
    scannedAt: new Date().toISOString(),
    ipAddress: ipAddress || null,
    userAgent: userAgent || null
  };
  db.prepare(
    `INSERT INTO employee_badge_scans (id, employeeId, badgeId, tokenId, scannedAt, ipAddress, userAgent)
     VALUES (@id, @employeeId, @badgeId, @tokenId, @scannedAt, @ipAddress, @userAgent)`
  ).run(record);
  return record;
}

async function generateBadge(employee, verifyBaseUrl) {
  if (!employee || !employee.id) {
    throw new Error('Employee record required to generate badge');
  }
  const cacheKey = employee.id;
  const cached = badgeCache.get(cacheKey);
  const now = Date.now();
  const cacheTtlMs = 1000 * 60 * 15;
  if (cached && now - cached.generatedAt < cacheTtlMs) {
    return cached;
  }
  const badgeId = uuidv4();
  const token = signBadgeToken(employee.id, badgeId);
  const verifyUrl = buildVerifyUrl(verifyBaseUrl, token);
  const buffer = await renderBadgePdf({ employee, verifyUrl, badgeId, token });
  const payload = { buffer, badgeId, token, verifyUrl, generatedAt: now };
  badgeCache.set(cacheKey, payload);
  return payload;
}

module.exports = {
  generateBadge,
  verifyBadgeToken,
  recordBadgeScan
};
