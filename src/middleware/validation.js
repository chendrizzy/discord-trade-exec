/**
 * Input validation and sanitization middleware
 * Provides security against XSS, SQL injection, and malformed inputs
 */

const validator = require('validator');

/**
 * Sanitize string input
 * Removes HTML tags and trims whitespace
 */
function sanitizeString(str) {
    if (typeof str !== 'string') return str;

    // Remove HTML tags AND their content (prevents XSS)
    let sanitized = str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    sanitized = sanitized.replace(/<[^>]*>/g, '');

    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');

    // Trim whitespace
    sanitized = sanitized.trim();

    return sanitized;
}

/**
 * Validate and sanitize email
 */
function validateEmail(email) {
    if (!email || typeof email !== 'string') {
        return { valid: false, error: 'Email is required' };
    }

    // Check for HTML tags or dangerous characters BEFORE sanitizing
    if (/<[^>]*>/.test(email) || email.includes('\0')) {
        return { valid: false, error: 'Invalid email format' };
    }

    const sanitized = sanitizeString(email);

    // Check length first
    if (sanitized.length > 255) {
        return { valid: false, error: 'Email too long' };
    }

    if (!validator.isEmail(sanitized)) {
        return { valid: false, error: 'Invalid email format' };
    }

    return { valid: true, sanitized };
}

/**
 * Validate API key format
 * Allows alphanumeric, dashes, underscores, and base64 characters
 */
function validateApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
        return { valid: false, error: 'API key is required' };
    }

    // Check for dangerous characters BEFORE sanitizing
    if (/<[^>]*>/.test(apiKey) || apiKey.includes('\0') || apiKey.includes('<') || apiKey.includes('>')) {
        return { valid: false, error: 'API key contains invalid characters' };
    }

    const sanitized = sanitizeString(apiKey);

    // Check length
    if (sanitized.length < 10 || sanitized.length > 512) {
        return { valid: false, error: 'API key length must be between 10 and 512 characters' };
    }

    // Allow only alphanumeric, dashes, underscores, equals, plus, and forward slash (base64 chars)
    if (!/^[a-zA-Z0-9\-_=+/]+$/.test(sanitized)) {
        return { valid: false, error: 'API key contains invalid characters' };
    }

    return { valid: true, sanitized };
}

/**
 * Validate numeric amount
 */
function validateAmount(amount, options = {}) {
    const { min, max = Infinity, allowNegative = false } = options;

    // Convert to number
    const num = Number(amount);

    if (isNaN(num)) {
        return { valid: false, error: 'Amount must be a valid number' };
    }

    // Check negative constraint
    if (!allowNegative && num < 0) {
        return { valid: false, error: 'Amount cannot be negative' };
    }

    // Check min constraint (only if min is explicitly set)
    if (min !== undefined && num < min) {
        return { valid: false, error: `Amount must be at least ${min}` };
    }

    // Check max constraint
    if (num > max) {
        return { valid: false, error: `Amount cannot exceed ${max}` };
    }

    return { valid: true, sanitized: num };
}

/**
 * Validate percentage (0-100 or 0-1)
 */
function validatePercentage(value, asDecimal = false) {
    const num = Number(value);

    if (isNaN(num)) {
        return { valid: false, error: 'Percentage must be a number' };
    }

    if (asDecimal) {
        if (num < 0 || num > 1) {
            return { valid: false, error: 'Percentage must be between 0 and 1' };
        }
    } else {
        if (num < 0 || num > 100) {
            return { valid: false, error: 'Percentage must be between 0 and 100' };
        }
    }

    return { valid: true, sanitized: num };
}

/**
 * Validate symbol (trading pair)
 */
function validateSymbol(symbol) {
    if (!symbol || typeof symbol !== 'string') {
        return { valid: false, error: 'Symbol is required' };
    }

    const sanitized = sanitizeString(symbol).toUpperCase();

    // Must be 3-20 characters, letters, numbers, and forward slash
    if (!/^[A-Z0-9]{2,10}\/[A-Z0-9]{2,10}$/.test(sanitized)) {
        return { valid: false, error: 'Invalid symbol format. Expected: BASE/QUOTE (e.g., BTC/USDT)' };
    }

    return { valid: true, sanitized };
}

/**
 * Validate exchange name
 */
function validateExchangeName(name) {
    if (!name || typeof name !== 'string') {
        return { valid: false, error: 'Exchange name is required' };
    }

    const sanitized = sanitizeString(name).toLowerCase();

    const supportedExchanges = [
        'binance', 'coinbase', 'kraken', 'bybit', 'okx',
        'bitfinex', 'huobi', 'kucoin', 'gate', 'gemini'
    ];

    if (!supportedExchanges.includes(sanitized)) {
        return {
            valid: false,
            error: `Unsupported exchange. Supported: ${supportedExchanges.join(', ')}`
        };
    }

    return { valid: true, sanitized };
}

/**
 * Validate webhook URL
 */
function validateWebhookUrl(url) {
    if (!url || typeof url !== 'string') {
        return { valid: false, error: 'Webhook URL is required' };
    }

    const sanitized = sanitizeString(url);

    // Check for localhost patterns first (before format validation)
    if (sanitized.includes('localhost') || sanitized.includes('127.0.0.1')) {
        return { valid: false, error: 'Localhost URLs not allowed' };
    }

    if (!validator.isURL(sanitized, {
        protocols: ['http', 'https'],
        require_protocol: true
    })) {
        return { valid: false, error: 'Invalid webhook URL format' };
    }

    return { valid: true, sanitized };
}

/**
 * Validate Discord ID
 */
function validateDiscordId(id) {
    if (!id || typeof id !== 'string') {
        return { valid: false, error: 'Discord ID is required' };
    }

    const sanitized = sanitizeString(id);

    // Discord IDs are 17-19 digit snowflakes
    if (!/^\d{17,19}$/.test(sanitized)) {
        return { valid: false, error: 'Invalid Discord ID format' };
    }

    return { valid: true, sanitized };
}

/**
 * Validate time string (HH:MM format)
 */
function validateTimeString(time) {
    if (!time || typeof time !== 'string') {
        return { valid: false, error: 'Time is required' };
    }

    const sanitized = sanitizeString(time);

    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(sanitized)) {
        return { valid: false, error: 'Invalid time format. Expected: HH:MM (24-hour)' };
    }

    return { valid: true, sanitized };
}

/**
 * Validate enum value
 */
function validateEnum(value, allowedValues, fieldName = 'Value') {
    if (!value) {
        return { valid: false, error: `${fieldName} is required` };
    }

    const sanitized = typeof value === 'string' ? sanitizeString(value) : value;

    if (!allowedValues.includes(sanitized)) {
        return {
            valid: false,
            error: `${fieldName} must be one of: ${allowedValues.join(', ')}`
        };
    }

    return { valid: true, sanitized };
}

/**
 * Sanitize object recursively
 * Removes dangerous patterns and sanitizes all string values
 */
function sanitizeObject(obj, maxDepth = 5, currentDepth = 0) {
    if (currentDepth >= maxDepth) {
        throw new Error('Maximum depth exceeded');
    }

    if (obj === null || obj === undefined) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item, maxDepth, currentDepth + 1));
    }

    if (typeof obj === 'object') {
        const sanitized = {};

        for (const [key, value] of Object.entries(obj)) {
            // Skip dangerous keys (prototype pollution, MongoDB injection)
            if (key === '__proto__' || key === 'constructor' || key === 'prototype' ||
                key.startsWith('__') || key.startsWith('$')) {
                continue;
            }

            sanitized[key] = sanitizeObject(value, maxDepth, currentDepth + 1);
        }

        return sanitized;
    }

    if (typeof obj === 'string') {
        return sanitizeString(obj);
    }

    return obj;
}

/**
 * Express middleware to validate request body
 */
function validateBody(schema) {
    return (req, res, next) => {
        const errors = [];

        for (const [field, validator] of Object.entries(schema)) {
            const value = req.body[field];

            // Check if field is required
            if (validator.required && (value === undefined || value === null || value === '')) {
                errors.push(`${field} is required`);
                continue;
            }

            // Skip validation if field is optional and not provided
            if (!validator.required && (value === undefined || value === null)) {
                continue;
            }

            // Run validator function
            if (typeof validator.validate === 'function') {
                const result = validator.validate(value, validator.options);

                if (!result.valid) {
                    errors.push(result.error);
                } else {
                    // Update request body with sanitized value
                    req.body[field] = result.sanitized;
                }
            }
        }

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors
            });
        }

        next();
    };
}

module.exports = {
    sanitizeString,
    sanitizeObject,
    validateEmail,
    validateApiKey,
    validateAmount,
    validatePercentage,
    validateSymbol,
    validateExchangeName,
    validateWebhookUrl,
    validateDiscordId,
    validateTimeString,
    validateEnum,
    validateBody
};
