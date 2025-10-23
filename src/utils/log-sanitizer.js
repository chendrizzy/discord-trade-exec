'use strict';

/**
 * Log Sanitizer - Redacts Sensitive Data from Logs
 * Prevents passwords, tokens, API keys, and other secrets from appearing in log files
 *
 * Constitutional Compliance:
 * - Principle I (Security-First): Prevents credential leakage
 * - Principle VI (Observability): Preserves structure for debugging
 */

/**
 * List of sensitive field names to redact
 * Supports exact match and partial match (e.g., 'password' matches 'userPassword')
 */
const SENSITIVE_FIELDS = [
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'apikey',
  'api_key',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'privatekey',
  'private_key',
  'ssn',
  'socialsecurity',
  'creditcard',
  'credit_card',
  'cardnumber',
  'cvv',
  'pin',
  'mfasecret',
  'mfa_secret',
  'otp',
  'authorization',
  'cookie',
  'session'
];

/**
 * Check if field name is sensitive (case-insensitive partial match)
 * @param {string} fieldName - Field name to check
 * @returns {boolean} True if field should be redacted
 */
function isSensitiveField(fieldName) {
  if (typeof fieldName !== 'string') return false;

  const lowerFieldName = fieldName.toLowerCase();
  return SENSITIVE_FIELDS.some(sensitive => lowerFieldName.includes(sensitive));
}

/**
 * Recursively sanitize an object, redacting sensitive fields
 * @param {*} obj - Object to sanitize (can be object, array, or primitive)
 * @returns {*} Sanitized copy with [REDACTED] replacing sensitive values
 */
function sanitize(obj) {
  // Handle null/undefined
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle primitives (string, number, boolean)
  if (typeof obj !== 'object') {
    return obj;
  }

  // Handle Date objects
  if (obj instanceof Date) {
    return obj;
  }

  // Handle Error objects
  if (obj instanceof Error) {
    return {
      name: obj.name,
      message: obj.message,
      stack: obj.stack
    };
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => sanitize(item));
  }

  // Handle plain objects
  const sanitized = {};

  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveField(key)) {
      // Redact sensitive fields but preserve structure
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      // Recursively sanitize nested objects
      sanitized[key] = sanitize(value);
    } else {
      // Keep non-sensitive primitives
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitize credit card numbers in strings (replace with masked version)
 * @param {string} str - String that might contain credit card numbers
 * @returns {string} String with credit cards masked (e.g., ****-****-****-1234)
 */
function sanitizeCreditCard(str) {
  if (typeof str !== 'string') return str;

  // Match 13-19 digit credit card numbers (with or without dashes/spaces)
  const ccPattern = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{3,4}\b/g;

  return str.replace(ccPattern, match => {
    // Keep last 4 digits, mask the rest
    const digits = match.replace(/[\s-]/g, '');
    const lastFour = digits.slice(-4);
    return `****-****-****-${lastFour}`;
  });
}

/**
 * Sanitize Social Security Numbers in strings
 * @param {string} str - String that might contain SSNs
 * @returns {string} String with SSNs masked (e.g., ***-**-1234)
 */
function sanitizeSSN(str) {
  if (typeof str !== 'string') return str;

  // Match SSN patterns (XXX-XX-XXXX or XXXXXXXXX)
  const ssnPattern = /\b\d{3}[\s-]?\d{2}[\s-]?\d{4}\b/g;

  return str.replace(ssnPattern, match => {
    const digits = match.replace(/[\s-]/g, '');
    const lastFour = digits.slice(-4);
    return `***-**-${lastFour}`;
  });
}

/**
 * Sanitize email addresses (preserve domain, mask local part)
 * @param {string} str - String that might contain emails
 * @returns {string} String with emails partially masked (e.g., t***@example.com)
 */
function sanitizeEmail(str) {
  if (typeof str !== 'string') return str;

  const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

  return str.replace(emailPattern, match => {
    const [local, domain] = match.split('@');
    if (local.length <= 1) return match;

    const masked = local[0] + '*'.repeat(Math.min(local.length - 1, 3));
    return `${masked}@${domain}`;
  });
}

module.exports = {
  sanitize,
  sanitizeCreditCard,
  sanitizeSSN,
  sanitizeEmail,
  isSensitiveField,
  SENSITIVE_FIELDS
};
