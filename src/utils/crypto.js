const crypto = require('crypto');

const SECRET_FALLBACK = 'aurora-nexus-skyhaven-chat-secret';

function getRawKey() {
  const source =
    process.env.CHAT_ENCRYPTION_KEY ||
    process.env.SESSION_SECRET ||
    process.env.SECRET_KEY ||
    SECRET_FALLBACK;
  return crypto.createHash('sha256').update(String(source)).digest();
}

function encryptText(plainText) {
  if (typeof plainText !== 'string') {
    throw new TypeError('Plain text must be a string.');
  }
  const key = getRawKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decryptText(payload) {
  if (typeof payload !== 'string' || payload.length === 0) {
    return '';
  }
  try {
    const buffer = Buffer.from(payload, 'base64');
    const iv = buffer.subarray(0, 12);
    const authTag = buffer.subarray(12, 28);
    const encrypted = buffer.subarray(28);
    const key = getRawKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    return '';
  }
}

module.exports = {
  encryptText,
  decryptText
};
