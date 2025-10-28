/**
 * ErrorCodes Constants Tests (US4-T02)
 *
 * Tests that validate comprehensive ErrorCodes enum:
 * - 50+ error codes defined
 * - HTTP status code mappings
 * - User-friendly messages
 * - Helper functions work correctly
 */

const {
  ErrorCodes,
  ErrorCodeDefinitions,
  getErrorDefinition,
  getStatusCode,
  getMessage,
  isValidErrorCode,
  getErrorCodesByCategory
} = require('../../../src/constants/ErrorCodes');

describe('ErrorCodes Constants (US4-T02)', () => {
  describe('ErrorCodes Enum', () => {
    it('should define 50+ error codes', () => {
      const errorCodeCount = Object.keys(ErrorCodes).length;

      expect(errorCodeCount).toBeGreaterThanOrEqual(50);
    });

    it('should have all error codes as string constants', () => {
      Object.entries(ErrorCodes).forEach(([key, value]) => {
        expect(typeof value).toBe('string');
        expect(value).toBe(key);
      });
    });

    it('should include essential authentication error codes', () => {
      expect(ErrorCodes).toHaveProperty('UNAUTHORIZED');
      expect(ErrorCodes).toHaveProperty('INVALID_TOKEN');
      expect(ErrorCodes).toHaveProperty('TOKEN_EXPIRED');
      expect(ErrorCodes).toHaveProperty('FORBIDDEN');
      expect(ErrorCodes).toHaveProperty('MFA_REQUIRED');
      expect(ErrorCodes).toHaveProperty('SESSION_EXPIRED');
    });

    it('should include essential validation error codes', () => {
      expect(ErrorCodes).toHaveProperty('VALIDATION_ERROR');
      expect(ErrorCodes).toHaveProperty('INVALID_INPUT');
      expect(ErrorCodes).toHaveProperty('MISSING_REQUIRED_FIELD');
      expect(ErrorCodes).toHaveProperty('INVALID_FORMAT');
      expect(ErrorCodes).toHaveProperty('PROTOTYPE_POLLUTION_DETECTED');
    });

    it('should include essential resource error codes', () => {
      expect(ErrorCodes).toHaveProperty('NOT_FOUND');
      expect(ErrorCodes).toHaveProperty('RESOURCE_NOT_FOUND');
      expect(ErrorCodes).toHaveProperty('DUPLICATE_RESOURCE');
      expect(ErrorCodes).toHaveProperty('USER_NOT_FOUND');
      expect(ErrorCodes).toHaveProperty('TRADE_NOT_FOUND');
    });

    it('should include broker/trading error codes', () => {
      expect(ErrorCodes).toHaveProperty('BROKER_ERROR');
      expect(ErrorCodes).toHaveProperty('BROKER_CONNECTION_FAILED');
      expect(ErrorCodes).toHaveProperty('INSUFFICIENT_FUNDS');
      expect(ErrorCodes).toHaveProperty('MARKET_CLOSED');
      expect(ErrorCodes).toHaveProperty('ORDER_REJECTED');
      expect(ErrorCodes).toHaveProperty('RISK_LIMIT_EXCEEDED');
    });

    it('should include billing/subscription error codes', () => {
      expect(ErrorCodes).toHaveProperty('BILLING_PAYMENT_FAILED');
      expect(ErrorCodes).toHaveProperty('SUBSCRIPTION_REQUIRED');
      expect(ErrorCodes).toHaveProperty('SUBSCRIPTION_EXPIRED');
      expect(ErrorCodes).toHaveProperty('PLAN_LIMIT_EXCEEDED');
    });

    it('should include rate limiting error codes', () => {
      expect(ErrorCodes).toHaveProperty('RATE_LIMIT_EXCEEDED');
      expect(ErrorCodes).toHaveProperty('API_RATE_LIMIT_EXCEEDED');
      expect(ErrorCodes).toHaveProperty('TRADE_RATE_LIMIT_EXCEEDED');
    });

    it('should include database error codes', () => {
      expect(ErrorCodes).toHaveProperty('DATABASE_ERROR');
      expect(ErrorCodes).toHaveProperty('DATABASE_CONNECTION_FAILED');
      expect(ErrorCodes).toHaveProperty('DATABASE_TIMEOUT');
    });

    it('should include external service error codes', () => {
      expect(ErrorCodes).toHaveProperty('EXTERNAL_SERVICE_ERROR');
      expect(ErrorCodes).toHaveProperty('DISCORD_API_ERROR');
      expect(ErrorCodes).toHaveProperty('POLAR_API_ERROR');
      expect(ErrorCodes).toHaveProperty('WEBHOOK_DELIVERY_FAILED');
    });

    it('should include server error codes', () => {
      expect(ErrorCodes).toHaveProperty('INTERNAL_SERVER_ERROR');
      expect(ErrorCodes).toHaveProperty('SERVICE_UNAVAILABLE');
      expect(ErrorCodes).toHaveProperty('GATEWAY_TIMEOUT');
      expect(ErrorCodes).toHaveProperty('CONFIGURATION_ERROR');
    });
  });

  describe('ErrorCodeDefinitions', () => {
    it('should map all error codes to definitions', () => {
      Object.keys(ErrorCodes).forEach(code => {
        expect(ErrorCodeDefinitions).toHaveProperty(code);
      });
    });

    it('should have statusCode for all error codes', () => {
      Object.values(ErrorCodeDefinitions).forEach(definition => {
        expect(definition).toHaveProperty('statusCode');
        expect(typeof definition.statusCode).toBe('number');
        expect(definition.statusCode).toBeGreaterThanOrEqual(400);
        expect(definition.statusCode).toBeLessThan(600);
      });
    });

    it('should have user-friendly messages for all error codes', () => {
      Object.values(ErrorCodeDefinitions).forEach(definition => {
        expect(definition).toHaveProperty('message');
        expect(typeof definition.message).toBe('string');
        expect(definition.message.length).toBeGreaterThan(0);
      });
    });

    it('should map authentication errors to 401', () => {
      expect(ErrorCodeDefinitions.UNAUTHORIZED.statusCode).toBe(401);
      expect(ErrorCodeDefinitions.INVALID_TOKEN.statusCode).toBe(401);
      expect(ErrorCodeDefinitions.TOKEN_EXPIRED.statusCode).toBe(401);
      expect(ErrorCodeDefinitions.MFA_REQUIRED.statusCode).toBe(401);
    });

    it('should map authorization errors to 403', () => {
      expect(ErrorCodeDefinitions.FORBIDDEN.statusCode).toBe(403);
      expect(ErrorCodeDefinitions.INSUFFICIENT_PERMISSIONS.statusCode).toBe(403);
      expect(ErrorCodeDefinitions.ACCOUNT_SUSPENDED.statusCode).toBe(403);
    });

    it('should map validation errors to 400', () => {
      expect(ErrorCodeDefinitions.VALIDATION_ERROR.statusCode).toBe(400);
      expect(ErrorCodeDefinitions.INVALID_INPUT.statusCode).toBe(400);
      expect(ErrorCodeDefinitions.MISSING_REQUIRED_FIELD.statusCode).toBe(400);
    });

    it('should map not found errors to 404', () => {
      expect(ErrorCodeDefinitions.NOT_FOUND.statusCode).toBe(404);
      expect(ErrorCodeDefinitions.RESOURCE_NOT_FOUND.statusCode).toBe(404);
      expect(ErrorCodeDefinitions.USER_NOT_FOUND.statusCode).toBe(404);
    });

    it('should map duplicate/conflict errors to 409', () => {
      expect(ErrorCodeDefinitions.DUPLICATE_RESOURCE.statusCode).toBe(409);
      expect(ErrorCodeDefinitions.DUPLICATE_EMAIL.statusCode).toBe(409);
      expect(ErrorCodeDefinitions.RESOURCE_CONFLICT.statusCode).toBe(409);
    });

    it('should map rate limiting errors to 429', () => {
      expect(ErrorCodeDefinitions.RATE_LIMIT_EXCEEDED.statusCode).toBe(429);
      expect(ErrorCodeDefinitions.API_RATE_LIMIT_EXCEEDED.statusCode).toBe(429);
    });

    it('should map server errors to 5xx', () => {
      expect(ErrorCodeDefinitions.INTERNAL_SERVER_ERROR.statusCode).toBe(500);
      expect(ErrorCodeDefinitions.SERVICE_UNAVAILABLE.statusCode).toBe(503);
      expect(ErrorCodeDefinitions.GATEWAY_TIMEOUT.statusCode).toBe(504);
    });

    it('should have user-friendly messages that do not expose internals', () => {
      Object.values(ErrorCodeDefinitions).forEach(definition => {
        // Messages should not contain technical jargon or internal details
        expect(definition.message).not.toMatch(/stack/i);
        expect(definition.message).not.toMatch(/exception/i);
        expect(definition.message).not.toMatch(/undefined/i);
        expect(definition.message).not.toMatch(/null/i);
      });
    });
  });

  describe('getErrorDefinition', () => {
    it('should return error definition for valid code', () => {
      const definition = getErrorDefinition('UNAUTHORIZED');

      expect(definition).toBeDefined();
      expect(definition.code).toBe('UNAUTHORIZED');
      expect(definition.statusCode).toBe(401);
      expect(definition.message).toBeTruthy();
    });

    it('should return null for invalid code', () => {
      const definition = getErrorDefinition('INVALID_CODE_THAT_DOES_NOT_EXIST');

      expect(definition).toBeNull();
    });

    it('should return complete definition with all properties', () => {
      const definition = getErrorDefinition('VALIDATION_ERROR');

      expect(definition).toHaveProperty('code');
      expect(definition).toHaveProperty('statusCode');
      expect(definition).toHaveProperty('message');
    });
  });

  describe('getStatusCode', () => {
    it('should return correct status code for valid error code', () => {
      expect(getStatusCode('UNAUTHORIZED')).toBe(401);
      expect(getStatusCode('FORBIDDEN')).toBe(403);
      expect(getStatusCode('NOT_FOUND')).toBe(404);
      expect(getStatusCode('VALIDATION_ERROR')).toBe(400);
      expect(getStatusCode('INTERNAL_SERVER_ERROR')).toBe(500);
    });

    it('should return 500 for invalid error code', () => {
      expect(getStatusCode('INVALID_CODE')).toBe(500);
    });

    it('should return 500 for undefined', () => {
      expect(getStatusCode(undefined)).toBe(500);
    });

    it('should return 500 for null', () => {
      expect(getStatusCode(null)).toBe(500);
    });
  });

  describe('getMessage', () => {
    it('should return user-friendly message for valid error code', () => {
      const message = getMessage('UNAUTHORIZED');

      expect(message).toBeTruthy();
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    });

    it('should return default message for invalid error code', () => {
      const message = getMessage('INVALID_CODE');

      expect(message).toBe('An unexpected error occurred.');
    });

    it('should return actionable messages', () => {
      // Check that messages provide actionable guidance
      expect(getMessage('UNAUTHORIZED')).toContain('log in');
      expect(getMessage('VALIDATION_ERROR')).toContain('check');
      expect(getMessage('RATE_LIMIT_EXCEEDED')).toContain('try again');
    });

    it('should not expose internal details', () => {
      Object.keys(ErrorCodes).forEach(code => {
        const message = getMessage(code);

        // Messages should not contain technical jargon or internal details
        expect(message).not.toMatch(/exception/i);
        expect(message).not.toMatch(/stack/i);
        expect(message).not.toMatch(/undefined/i);
        expect(message).not.toMatch(/\bnull\b/i);
      });
    });
  });

  describe('isValidErrorCode', () => {
    it('should return true for valid error codes', () => {
      expect(isValidErrorCode('UNAUTHORIZED')).toBe(true);
      expect(isValidErrorCode('VALIDATION_ERROR')).toBe(true);
      expect(isValidErrorCode('NOT_FOUND')).toBe(true);
      expect(isValidErrorCode('INTERNAL_SERVER_ERROR')).toBe(true);
    });

    it('should return false for invalid error codes', () => {
      expect(isValidErrorCode('INVALID_CODE')).toBe(false);
      expect(isValidErrorCode('NOT_A_REAL_ERROR')).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isValidErrorCode(undefined)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isValidErrorCode(null)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidErrorCode('')).toBe(false);
    });
  });

  describe('getErrorCodesByCategory', () => {
    it('should return error codes grouped by category', () => {
      const categories = getErrorCodesByCategory();

      expect(categories).toHaveProperty('authentication');
      expect(categories).toHaveProperty('authorization');
      expect(categories).toHaveProperty('validation');
      expect(categories).toHaveProperty('resources');
      expect(categories).toHaveProperty('rateLimiting');
      expect(categories).toHaveProperty('broker');
      expect(categories).toHaveProperty('database');
      expect(categories).toHaveProperty('externalServices');
      expect(categories).toHaveProperty('billing');
      expect(categories).toHaveProperty('server');
    });

    it('should have arrays of error codes in each category', () => {
      const categories = getErrorCodesByCategory();

      Object.values(categories).forEach(codes => {
        expect(Array.isArray(codes)).toBe(true);
        expect(codes.length).toBeGreaterThan(0);
      });
    });

    it('should have valid error codes in each category', () => {
      const categories = getErrorCodesByCategory();

      Object.values(categories).forEach(codes => {
        codes.forEach(code => {
          expect(isValidErrorCode(code)).toBe(true);
        });
      });
    });

    it('should categorize authentication codes correctly', () => {
      const categories = getErrorCodesByCategory();

      expect(categories.authentication).toContain('UNAUTHORIZED');
      expect(categories.authentication).toContain('INVALID_TOKEN');
      expect(categories.authentication).toContain('TOKEN_EXPIRED');
      expect(categories.authentication).toContain('MFA_REQUIRED');
    });

    it('should categorize broker codes correctly', () => {
      const categories = getErrorCodesByCategory();

      expect(categories.broker).toContain('BROKER_ERROR');
      expect(categories.broker).toContain('INSUFFICIENT_FUNDS');
      expect(categories.broker).toContain('MARKET_CLOSED');
      expect(categories.broker).toContain('ORDER_REJECTED');
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain all original error codes from errorHandler.js', () => {
      const originalCodes = [
        'UNAUTHORIZED',
        'FORBIDDEN',
        'INVALID_TOKEN',
        'TOKEN_EXPIRED',
        'VALIDATION_ERROR',
        'INVALID_INPUT',
        'MISSING_REQUIRED_FIELD',
        'NOT_FOUND',
        'RESOURCE_NOT_FOUND',
        'DUPLICATE_RESOURCE',
        'RATE_LIMIT_EXCEEDED',
        'BROKER_ERROR',
        'BROKER_CONNECTION_FAILED',
        'BROKER_AUTH_FAILED',
        'INSUFFICIENT_FUNDS',
        'MARKET_CLOSED',
        'DATABASE_ERROR',
        'DATABASE_CONNECTION_FAILED',
        'EXTERNAL_SERVICE_ERROR',
        'DISCORD_API_ERROR',
        'POLAR_API_ERROR',
        'INTERNAL_SERVER_ERROR',
        'SERVICE_UNAVAILABLE',
        'CONFIGURATION_ERROR'
      ];

      originalCodes.forEach(code => {
        expect(ErrorCodes).toHaveProperty(code);
        expect(ErrorCodeDefinitions).toHaveProperty(code);
      });
    });
  });

  describe('Error Code Quality', () => {
    it('should have unique error codes', () => {
      const codes = Object.values(ErrorCodes);
      const uniqueCodes = new Set(codes);

      expect(uniqueCodes.size).toBe(codes.length);
    });

    it('should have meaningful error code names', () => {
      Object.keys(ErrorCodes).forEach(code => {
        // Error code names should be descriptive
        expect(code.length).toBeGreaterThan(3);
        expect(code).toMatch(/^[A-Z_]+$/); // All caps with underscores
      });
    });

    it('should have consistent message format', () => {
      Object.values(ErrorCodeDefinitions).forEach(definition => {
        const message = definition.message;

        // Messages should start with capital letter
        expect(message[0]).toMatch(/[A-Z]/);

        // Messages should end with period
        expect(message).toMatch(/\.$/);
      });
    });
  });
});
