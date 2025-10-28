/**
 * Retry Utility Tests (US4-T03)
 *
 * Tests that validate retry logic for transient failures:
 * - Exponential backoff (1s, 2s, 4s, 8s)
 * - Max retries: 3
 * - Only retry on network errors
 * - Never retry on 4xx errors
 */

const {
  retryWithBackoff,
  retryImmediate,
  isRetryableError,
  calculateBackoff,
  RETRYABLE_ERROR_CODES,
  NON_RETRYABLE_STATUS_CODES
} = require('../../../src/utils/retry');
const logger = require('../../../src/utils/logger');

// Mock logger to prevent console output during tests
jest.mock('../../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

describe('Retry Utility (US4-T03)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Constants', () => {
    it('should define retryable error codes', () => {
      expect(RETRYABLE_ERROR_CODES).toBeInstanceOf(Set);
      expect(RETRYABLE_ERROR_CODES.size).toBeGreaterThan(0);

      // Check essential network error codes
      expect(RETRYABLE_ERROR_CODES.has('ECONNRESET')).toBe(true);
      expect(RETRYABLE_ERROR_CODES.has('ETIMEDOUT')).toBe(true);
      expect(RETRYABLE_ERROR_CODES.has('ECONNREFUSED')).toBe(true);
      expect(RETRYABLE_ERROR_CODES.has('ENETUNREACH')).toBe(true);
      expect(RETRYABLE_ERROR_CODES.has('EHOSTUNREACH')).toBe(true);
    });

    it('should define non-retryable status codes', () => {
      expect(NON_RETRYABLE_STATUS_CODES).toBeInstanceOf(Set);
      expect(NON_RETRYABLE_STATUS_CODES.size).toBeGreaterThan(0);

      // Check essential 4xx codes
      expect(NON_RETRYABLE_STATUS_CODES.has(400)).toBe(true);
      expect(NON_RETRYABLE_STATUS_CODES.has(401)).toBe(true);
      expect(NON_RETRYABLE_STATUS_CODES.has(403)).toBe(true);
      expect(NON_RETRYABLE_STATUS_CODES.has(404)).toBe(true);
      expect(NON_RETRYABLE_STATUS_CODES.has(422)).toBe(true);
    });

    it('should include all 4xx client error codes', () => {
      const expectedCodes = [400, 401, 403, 404, 405, 406, 409, 410, 422, 429];

      expectedCodes.forEach(code => {
        expect(NON_RETRYABLE_STATUS_CODES.has(code)).toBe(true);
      });
    });
  });

  describe('calculateBackoff', () => {
    it('should calculate exponential backoff correctly', () => {
      expect(calculateBackoff(0, 1000)).toBe(1000); // 1s
      expect(calculateBackoff(1, 1000)).toBe(2000); // 2s
      expect(calculateBackoff(2, 1000)).toBe(4000); // 4s
      expect(calculateBackoff(3, 1000)).toBe(8000); // 8s
    });

    it('should use default base delay of 1000ms', () => {
      expect(calculateBackoff(0)).toBe(1000);
      expect(calculateBackoff(1)).toBe(2000);
      expect(calculateBackoff(2)).toBe(4000);
    });

    it('should work with custom base delay', () => {
      expect(calculateBackoff(0, 500)).toBe(500);
      expect(calculateBackoff(1, 500)).toBe(1000);
      expect(calculateBackoff(2, 500)).toBe(2000);
    });

    it('should handle attempt number 0', () => {
      expect(calculateBackoff(0, 1000)).toBe(1000);
    });
  });

  describe('isRetryableError', () => {
    it('should identify network error codes as retryable', () => {
      const networkErrors = [
        { code: 'ECONNRESET' },
        { code: 'ETIMEDOUT' },
        { code: 'ECONNREFUSED' },
        { code: 'ENETUNREACH' },
        { code: 'EHOSTUNREACH' }
      ];

      networkErrors.forEach(error => {
        expect(isRetryableError(error)).toBe(true);
      });
    });

    it('should identify 4xx errors as non-retryable', () => {
      const clientErrors = [
        { response: { status: 400 } },
        { response: { status: 401 } },
        { response: { status: 403 } },
        { response: { status: 404 } },
        { response: { status: 422 } }
      ];

      clientErrors.forEach(error => {
        expect(isRetryableError(error)).toBe(false);
      });
    });

    it('should identify 5xx errors as retryable', () => {
      const serverErrors = [
        { response: { status: 500 } },
        { response: { status: 502 } },
        { response: { status: 503 } },
        { response: { status: 504 } }
      ];

      serverErrors.forEach(error => {
        expect(isRetryableError(error)).toBe(true);
      });
    });

    it('should handle error.status property (alternative structure)', () => {
      expect(isRetryableError({ status: 400 })).toBe(false);
      expect(isRetryableError({ status: 500 })).toBe(true);
    });

    it('should identify timeout messages as retryable', () => {
      expect(isRetryableError({ message: 'Request timeout' })).toBe(true);
      expect(isRetryableError({ message: 'Operation timeout' })).toBe(true);
      expect(isRetryableError({ message: 'TIMEOUT exceeded' })).toBe(true);
    });

    it('should identify network messages as retryable', () => {
      const networkErrors = [
        { message: 'Network error occurred' },
        { message: 'ECONNRESET' },
        { message: 'socket hang up' }
      ];

      networkErrors.forEach(error => {
        expect(isRetryableError(error)).toBe(true);
      });
    });

    it('should default to non-retryable for unknown errors', () => {
      expect(isRetryableError({ message: 'Unknown error' })).toBe(false);
      expect(isRetryableError(new Error('Generic error'))).toBe(false);
    });
  });

  describe('retryWithBackoff', () => {
    it('should succeed on first attempt without retries', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await retryWithBackoff(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should retry on network errors with exponential backoff', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce({ code: 'ECONNRESET', message: 'Connection reset' })
        .mockRejectedValueOnce({ code: 'ETIMEDOUT', message: 'Timeout' })
        .mockResolvedValueOnce('success');

      const promise = retryWithBackoff(operation);

      // First attempt fails immediately
      await jest.advanceTimersByTimeAsync(0);

      // Wait for first backoff (1s)
      await jest.advanceTimersByTimeAsync(1000);

      // Wait for second backoff (2s)
      await jest.advanceTimersByTimeAsync(2000);

      const result = await promise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
      expect(logger.warn).toHaveBeenCalledTimes(2); // Two retry warnings
      expect(logger.info).toHaveBeenCalledTimes(1); // Success after retry
    });

    it('should enforce maximum retry limit of 3', async () => {
      jest.useRealTimers(); // Use real timers for this test

      const operation = jest.fn().mockRejectedValue({ code: 'ETIMEDOUT' });

      await expect(
        retryWithBackoff(operation, { baseDelay: 10 }) // Very short delays
      ).rejects.toMatchObject({ code: 'ETIMEDOUT' });

      expect(operation).toHaveBeenCalledTimes(4); // Initial + 3 retries
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Max retries exhausted'),
        expect.any(Object)
      );

      jest.useFakeTimers(); // Restore fake timers
    });

    it('should not retry on 4xx client errors', async () => {
      const operation = jest.fn().mockRejectedValue({
        response: { status: 404 },
        message: 'Not found'
      });

      await expect(retryWithBackoff(operation)).rejects.toMatchObject({
        response: { status: 404 }
      });

      expect(operation).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('not retryable'),
        expect.any(Object)
      );
    });

    it('should accept custom maxRetries option', async () => {
      jest.useRealTimers();

      const operation = jest.fn().mockRejectedValue({ code: 'ETIMEDOUT' });

      await expect(
        retryWithBackoff(operation, { maxRetries: 2, baseDelay: 10 })
      ).rejects.toMatchObject({ code: 'ETIMEDOUT' });

      expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries

      jest.useFakeTimers();
    });

    it('should accept custom baseDelay option', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce({ code: 'ECONNRESET' })
        .mockResolvedValueOnce('success');

      const promise = retryWithBackoff(operation, { baseDelay: 500 });

      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(500); // Custom base delay

      const result = await promise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should accept custom shouldRetry function', async () => {
      const customRetry = jest.fn().mockReturnValue(false);
      const operation = jest.fn().mockRejectedValue({ message: 'Error' });

      await expect(
        retryWithBackoff(operation, { shouldRetry: customRetry })
      ).rejects.toMatchObject({ message: 'Error' });

      expect(customRetry).toHaveBeenCalled();
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should include context in logs', async () => {
      jest.useRealTimers();

      const operation = jest.fn().mockRejectedValue({ code: 'ETIMEDOUT' });
      const context = { operationName: 'fetchData', userId: 'user123' };

      await expect(
        retryWithBackoff(operation, { context, baseDelay: 10 })
      ).rejects.toMatchObject({ code: 'ETIMEDOUT' });

      expect(logger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          operationName: 'fetchData',
          userId: 'user123'
        })
      );

      jest.useFakeTimers();
    });

    it('should log retry attempts with correct details', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce({ code: 'ECONNRESET' })
        .mockResolvedValueOnce('success');

      const promise = retryWithBackoff(operation);

      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(1000);

      await promise;

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('retrying with backoff'),
        expect.objectContaining({
          attempt: 1,
          maxRetries: 3,
          nextRetryInMs: 1000
        })
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('succeeded after retries'),
        expect.objectContaining({
          attempt: 1,
          totalAttempts: 2
        })
      );
    });

    it('should retry on 5xx server errors', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce({ response: { status: 500 } })
        .mockResolvedValueOnce('success');

      const promise = retryWithBackoff(operation);

      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(1000);

      const result = await promise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('retryImmediate', () => {
    it('should retry without backoff delay', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce({ code: 'ECONNRESET' })
        .mockResolvedValueOnce('success');

      const promise = retryImmediate(operation);

      await jest.advanceTimersByTimeAsync(0);

      const result = await promise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should use baseDelay of 0', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce({ code: 'ECONNRESET' })
        .mockResolvedValueOnce('success');

      const promise = retryImmediate(operation);

      // Should not need to advance timers for retries
      await jest.advanceTimersByTimeAsync(0);

      const result = await promise;

      expect(result).toBe('success');
    });

    it('should still respect maxRetries', async () => {
      jest.useRealTimers();

      const operation = jest.fn().mockRejectedValue({ code: 'ETIMEDOUT' });

      await expect(
        retryImmediate(operation, { maxRetries: 2 })
      ).rejects.toMatchObject({ code: 'ETIMEDOUT' });

      expect(operation).toHaveBeenCalledTimes(3);

      jest.useFakeTimers();
    });
  });

  describe('Backoff Sequence Validation', () => {
    it('should follow exact backoff sequence: 1s, 2s, 4s, 8s', async () => {
      jest.useRealTimers();

      const operation = jest.fn().mockRejectedValue({ code: 'ETIMEDOUT' });

      await expect(
        retryWithBackoff(operation, { baseDelay: 10 }) // Use 10ms base delay for speed
      ).rejects.toMatchObject({ code: 'ETIMEDOUT' });

      // Verify logger was called with correct delays in sequence (scaled down)
      expect(logger.warn).toHaveBeenNthCalledWith(
        1,
        expect.any(String),
        expect.objectContaining({ nextRetryInMs: 10 })
      );
      expect(logger.warn).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        expect.objectContaining({ nextRetryInMs: 20 })
      );
      expect(logger.warn).toHaveBeenNthCalledWith(
        3,
        expect.any(String),
        expect.objectContaining({ nextRetryInMs: 40 })
      );

      jest.useFakeTimers();
    });
  });

  describe('Error Handling Edge Cases', () => {
    it('should handle errors without code or status', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Generic error'));

      await expect(retryWithBackoff(operation)).rejects.toThrow('Generic error');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should handle errors with both code and status', async () => {
      const error = {
        code: 'ECONNRESET',
        response: { status: 500 }
      };
      const operation = jest.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const promise = retryWithBackoff(operation);

      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(1000);

      const result = await promise;

      expect(result).toBe('success');
    });

    it('should handle errors without proper structure', async () => {
      const operation = jest.fn().mockRejectedValue({ customProperty: 'value' });

      await expect(retryWithBackoff(operation)).rejects.toMatchObject({
        customProperty: 'value'
      });
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });
});
