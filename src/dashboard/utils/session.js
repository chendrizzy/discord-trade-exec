/**
 * Session utilities for extracting session information from cookies
 */

/**
 * Parse cookies into an object
 * @returns {Object} Cookie key-value pairs
 */
function parseCookies() {
  return document.cookie.split(';').reduce((cookies, cookie) => {
    const [name, value] = cookie.split('=').map(c => c.trim());
    cookies[name] = value;
    return cookies;
  }, {});
}

/**
 * Get session ID from cookies
 * Express-session uses 'connect.sid' cookie by default
 * @returns {string|null} Session ID or null if not found
 */
export function getSessionID() {
  const cookies = parseCookies();

  // Express-session cookie format: connect.sid=s%3A<sessionID>.<signature>
  const sessionCookie = cookies['connect.sid'];

  if (!sessionCookie) {
    console.warn('No session cookie found');
    return null;
  }

  try {
    // Decode URI component
    const decoded = decodeURIComponent(sessionCookie);

    // Extract session ID from 's:<sessionID>.<signature>' format
    // Format is: s%3A<sessionID>.<signature> or s:<sessionID>.<signature>
    const match = decoded.match(/^s[%:]([\w-]+)\./);

    if (match && match[1]) {
      return match[1];
    }

    // Fallback: use the entire cookie value if format doesn't match
    console.warn('Session cookie format unexpected, using full value');
    return decoded;
  } catch (error) {
    console.error('Failed to parse session cookie:', error);
    return null;
  }
}

/**
 * Get user ID from user object
 * @param {Object} user - User object from auth status
 * @returns {string|null} User ID or null if not available
 */
export function getUserID(user) {
  if (!user) {
    return null;
  }

  // Try different possible user ID fields
  return user.id || user._id || user.userId || null;
}
