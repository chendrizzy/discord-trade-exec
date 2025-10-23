'use strict';

const sanitizer = require('../../../src/utils/log-sanitizer');

describe('LogSanitizer', () => {
  describe('Field Name Detection', () => {
    it('should identify password fields as sensitive', () => {
      expect(sanitizer.isSensitiveField('password')).toBe(true);
      expect(sanitizer.isSensitiveField('userPassword')).toBe(true);
      expect(sanitizer.isSensitiveField('Password')).toBe(true);
      expect(sanitizer.isSensitiveField('PASSWORD')).toBe(true);
    });

    it('should identify token fields as sensitive', () => {
      expect(sanitizer.isSensitiveField('token')).toBe(true);
      expect(sanitizer.isSensitiveField('accessToken')).toBe(true);
      expect(sanitizer.isSensitiveField('refreshToken')).toBe(true);
      expect(sanitizer.isSensitiveField('apiToken')).toBe(true);
    });

    it('should identify API key fields as sensitive', () => {
      expect(sanitizer.isSensitiveField('apiKey')).toBe(true);
      expect(sanitizer.isSensitiveField('api_key')).toBe(true);
      expect(sanitizer.isSensitiveField('ApiKey')).toBe(true);
    });

    it('should not identify safe fields as sensitive', () => {
      expect(sanitizer.isSensitiveField('username')).toBe(false);
      expect(sanitizer.isSensitiveField('email')).toBe(false);
      expect(sanitizer.isSensitiveField('userId')).toBe(false);
      expect(sanitizer.isSensitiveField('name')).toBe(false);
    });
  });

  describe('Object Sanitization', () => {
    it('should redact password fields', () => {
      const input = {
        email: 'test@example.com',
        password: 'secret123'
      };

      const sanitized = sanitizer.sanitize(input);

      expect(sanitized.email).toBe('test@example.com');
      expect(sanitized.password).toBe('[REDACTED]');
    });

    it('should redact multiple sensitive fields', () => {
      const input = {
        username: 'john',
        password: 'secret',
        apiKey: 'pk_test_123',
        token: 'bearer_xyz'
      };

      const sanitized = sanitizer.sanitize(input);

      expect(sanitized.username).toBe('john');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.apiKey).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
    });

    it('should preserve object structure', () => {
      const input = {
        user: {
          id: 123,
          email: 'test@example.com',
          password: 'secret'
        }
      };

      const sanitized = sanitizer.sanitize(input);

      expect(sanitized).toHaveProperty('user');
      expect(sanitized.user).toHaveProperty('id');
      expect(sanitized.user).toHaveProperty('email');
      expect(sanitized.user).toHaveProperty('password');
      expect(sanitized.user.password).toBe('[REDACTED]');
    });

    it('should handle nested objects', () => {
      const input = {
        user: {
          profile: {
            name: 'John Doe',
            credentials: {
              password: 'secret',
              mfaSecret: 'JBSWY3DPEHPK3PXP'
            }
          }
        }
      };

      const sanitized = sanitizer.sanitize(input);

      expect(sanitized.user.profile.name).toBe('John Doe');
      expect(sanitized.user.profile.credentials.password).toBe('[REDACTED]');
      expect(sanitized.user.profile.credentials.mfaSecret).toBe('[REDACTED]');
    });

    it('should handle arrays', () => {
      const input = {
        users: [
          { name: 'Alice', password: 'secret1' },
          { name: 'Bob', password: 'secret2' }
        ]
      };

      const sanitized = sanitizer.sanitize(input);

      expect(sanitized.users[0].name).toBe('Alice');
      expect(sanitized.users[0].password).toBe('[REDACTED]');
      expect(sanitized.users[1].name).toBe('Bob');
      expect(sanitized.users[1].password).toBe('[REDACTED]');
    });

    it('should handle null and undefined', () => {
      expect(sanitizer.sanitize(null)).toBeNull();
      expect(sanitizer.sanitize(undefined)).toBeUndefined();

      const input = {
        field1: null,
        field2: undefined,
        password: 'secret'
      };

      const sanitized = sanitizer.sanitize(input);

      expect(sanitized.field1).toBeNull();
      expect(sanitized.field2).toBeUndefined();
      expect(sanitized.password).toBe('[REDACTED]');
    });

    it('should handle primitives', () => {
      expect(sanitizer.sanitize('string')).toBe('string');
      expect(sanitizer.sanitize(123)).toBe(123);
      expect(sanitizer.sanitize(true)).toBe(true);
    });

    it('should handle Date objects', () => {
      const date = new Date('2025-01-01');
      const sanitized = sanitizer.sanitize({ createdAt: date });

      expect(sanitized.createdAt).toEqual(date);
    });

    it('should handle Error objects', () => {
      const error = new Error('Test error');
      const sanitized = sanitizer.sanitize({ error });

      expect(sanitized.error.name).toBe('Error');
      expect(sanitized.error.message).toBe('Test error');
      expect(sanitized.error.stack).toBeDefined();
    });
  });

  describe('Credit Card Sanitization', () => {
    it('should mask credit card numbers', () => {
      const input = 'Payment with card 4532-1234-5678-9012';
      const sanitized = sanitizer.sanitizeCreditCard(input);

      expect(sanitized).toBe('Payment with card ****-****-****-9012');
    });

    it('should handle cards without dashes', () => {
      const input = 'Card number: 4532123456789012';
      const sanitized = sanitizer.sanitizeCreditCard(input);

      expect(sanitized).toBe('Card number: ****-****-****-9012');
    });

    it('should handle multiple cards', () => {
      const input = 'Cards: 4532123456789012 and 5105-1051-0510-5100';
      const sanitized = sanitizer.sanitizeCreditCard(input);

      expect(sanitized).toContain('****-****-****-9012');
      expect(sanitized).toContain('****-****-****-5100');
    });

    it('should not modify non-credit card numbers', () => {
      const input = 'User ID: 12345';
      const sanitized = sanitizer.sanitizeCreditCard(input);

      expect(sanitized).toBe(input);
    });
  });

  describe('SSN Sanitization', () => {
    it('should mask SSN with dashes', () => {
      const input = 'SSN: 123-45-6789';
      const sanitized = sanitizer.sanitizeSSN(input);

      expect(sanitized).toBe('SSN: ***-**-6789');
    });

    it('should mask SSN without dashes', () => {
      const input = 'SSN: 123456789';
      const sanitized = sanitizer.sanitizeSSN(input);

      expect(sanitized).toBe('SSN: ***-**-6789');
    });

    it('should handle multiple SSNs', () => {
      const input = 'SSNs: 123-45-6789 and 987654321';
      const sanitized = sanitizer.sanitizeSSN(input);

      expect(sanitized).toContain('***-**-6789');
      expect(sanitized).toContain('***-**-4321');
    });
  });

  describe('Email Sanitization', () => {
    it('should partially mask email addresses', () => {
      const input = 'Email: test@example.com';
      const sanitized = sanitizer.sanitizeEmail(input);

      expect(sanitized).toBe('Email: t***@example.com');
    });

    it('should handle multiple emails', () => {
      const input = 'Emails: alice@example.com and bob@test.org';
      const sanitized = sanitizer.sanitizeEmail(input);

      expect(sanitized).toContain('a***@example.com');
      expect(sanitized).toContain('b**@test.org');
    });

    it('should handle single character local part', () => {
      const input = 'Email: a@example.com';
      const sanitized = sanitizer.sanitizeEmail(input);

      // Single character emails should be preserved
      expect(sanitized).toBe('Email: a@example.com');
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle object with all sensitive data types', () => {
      const input = {
        user: {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'secret123',
          ssn: '123-45-6789',
          creditCard: '4532-1234-5678-9012',
          apiKey: 'pk_live_abc123',
          mfaSecret: 'JBSWY3DPEHPK3PXP'
        }
      };

      const sanitized = sanitizer.sanitize(input);

      expect(sanitized.user.name).toBe('John Doe');
      expect(sanitized.user.email).toBe('john@example.com');
      expect(sanitized.user.password).toBe('[REDACTED]');
      expect(sanitized.user.ssn).toBe('[REDACTED]');
      expect(sanitized.user.creditCard).toBe('[REDACTED]');
      expect(sanitized.user.apiKey).toBe('[REDACTED]');
      expect(sanitized.user.mfaSecret).toBe('[REDACTED]');
    });

    it('should not modify the original object', () => {
      const input = {
        password: 'secret'
      };

      const sanitized = sanitizer.sanitize(input);

      expect(input.password).toBe('secret'); // Original unchanged
      expect(sanitized.password).toBe('[REDACTED]'); // Copy redacted
    });
  });
});
