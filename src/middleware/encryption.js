// Node.js built-in modules
const crypto = require('crypto');

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex'), 'hex');

/**
 * Encrypt sensitive data (API keys, secrets)
 * @param {string} text - Plain text to encrypt
 * @returns {object} - Encrypted data with IV and auth tag
 */
function encrypt(text) {
  if (!text) {
    throw new Error('Cannot encrypt empty text');
  }

  // Generate random initialization vector
  const iv = crypto.randomBytes(16);

  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  // Encrypt the text
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Get authentication tag
  const authTag = cipher.getAuthTag();

  return {
    encrypted: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

/**
 * Decrypt sensitive data
 * @param {string} encrypted - Encrypted data
 * @param {string} iv - Initialization vector
 * @param {string} authTag - Authentication tag
 * @returns {string} - Decrypted plain text
 */
function decrypt(encrypted, iv, authTag) {
  if (!encrypted || !iv || !authTag) {
    throw new Error('Missing required decryption parameters');
  }

  try {
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(iv, 'hex'));

    // Set authentication tag
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    // Decrypt the text
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    throw new Error('Decryption failed: Invalid encrypted data or key');
  }
}

/**
 * Hash sensitive data (one-way, for verification only)
 * @param {string} text - Text to hash
 * @returns {string} - SHA-256 hash
 */
function hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Generate random encryption key
 * @returns {string} - 32-byte hex key
 */
function generateKey() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Verify HMAC signature (for webhooks)
 * @param {string} payload - Request body
 * @param {string} signature - Signature to verify
 * @param {string} secret - Secret key
 * @returns {boolean} - True if signature is valid
 */
function verifySignature(payload, signature, secret) {
  const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  // Check length first to prevent timingSafeEqual error
  if (signature.length !== expectedSignature.length) {
    return false;
  }

  // Use timing-safe comparison to prevent timing attacks
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

module.exports = {
  encrypt,
  decrypt,
  hash,
  generateKey,
  verifySignature
};
