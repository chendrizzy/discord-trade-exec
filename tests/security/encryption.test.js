const { describe, it, expect } = require('@jest/globals');
const { encrypt, decrypt, hash, generateKey, verifySignature } = require('../../src/middleware/encryption');

describe('Encryption Security Tests', () => {
    describe('AES-256-GCM Encryption', () => {
        it('should encrypt and decrypt data successfully', () => {
            const plaintext = 'my-super-secret-api-key-12345';

            const encrypted = encrypt(plaintext);

            expect(encrypted).toHaveProperty('encrypted');
            expect(encrypted).toHaveProperty('iv');
            expect(encrypted).toHaveProperty('authTag');
            expect(encrypted.encrypted).not.toBe(plaintext);

            const decrypted = decrypt(
                encrypted.encrypted,
                encrypted.iv,
                encrypted.authTag
            );

            expect(decrypted).toBe(plaintext);
        });

        it('should generate unique IV for each encryption', () => {
            const plaintext = 'same-plaintext';

            const encrypted1 = encrypt(plaintext);
            const encrypted2 = encrypt(plaintext);

            expect(encrypted1.iv).not.toBe(encrypted2.iv);
            expect(encrypted1.encrypted).not.toBe(encrypted2.encrypted);
        });

        it('should fail decryption with wrong IV', () => {
            const plaintext = 'test-data';
            const encrypted = encrypt(plaintext);

            // Create wrong IV
            const wrongIv = '0'.repeat(32);

            expect(() => {
                decrypt(encrypted.encrypted, wrongIv, encrypted.authTag);
            }).toThrow();
        });

        it('should fail decryption with wrong auth tag', () => {
            const plaintext = 'test-data';
            const encrypted = encrypt(plaintext);

            // Create wrong auth tag
            const wrongAuthTag = '0'.repeat(32);

            expect(() => {
                decrypt(encrypted.encrypted, encrypted.iv, wrongAuthTag);
            }).toThrow();
        });

        it('should fail decryption with tampered ciphertext', () => {
            const plaintext = 'test-data';
            const encrypted = encrypt(plaintext);

            // Tamper with ciphertext
            const tampered = encrypted.encrypted.slice(0, -4) + 'abcd';

            expect(() => {
                decrypt(tampered, encrypted.iv, encrypted.authTag);
            }).toThrow();
        });

        it('should throw error when encrypting empty string', () => {
            expect(() => {
                encrypt('');
            }).toThrow('Cannot encrypt empty text');
        });

        it('should throw error when encrypting null', () => {
            expect(() => {
                encrypt(null);
            }).toThrow('Cannot encrypt empty text');
        });

        it('should handle long API keys', () => {
            const longKey = 'a'.repeat(1000);

            const encrypted = encrypt(longKey);
            const decrypted = decrypt(
                encrypted.encrypted,
                encrypted.iv,
                encrypted.authTag
            );

            expect(decrypted).toBe(longKey);
        });

        it('should handle special characters in API keys', () => {
            const specialKey = 'key-with-!@#$%^&*()_+=[]{}|;:,.<>?/`~';

            const encrypted = encrypt(specialKey);
            const decrypted = decrypt(
                encrypted.encrypted,
                encrypted.iv,
                encrypted.authTag
            );

            expect(decrypted).toBe(specialKey);
        });
    });

    describe('Hashing (SHA-256)', () => {
        it('should generate consistent hash for same input', () => {
            const input = 'test-data';

            const hash1 = hash(input);
            const hash2 = hash(input);

            expect(hash1).toBe(hash2);
            expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex chars
        });

        it('should generate different hash for different inputs', () => {
            const hash1 = hash('test1');
            const hash2 = hash('test2');

            expect(hash1).not.toBe(hash2);
        });

        it('should be irreversible (one-way)', () => {
            const input = 'secret-data';
            const hashed = hash(input);

            // There's no decrypt function for hashes
            expect(hashed).not.toBe(input);
            expect(hashed).toHaveLength(64);
        });
    });

    describe('Key Generation', () => {
        it('should generate 32-byte hex key', () => {
            const key = generateKey();

            expect(key).toHaveLength(64); // 32 bytes = 64 hex chars
            expect(/^[0-9a-f]{64}$/.test(key)).toBe(true);
        });

        it('should generate unique keys', () => {
            const key1 = generateKey();
            const key2 = generateKey();
            const key3 = generateKey();

            expect(key1).not.toBe(key2);
            expect(key2).not.toBe(key3);
            expect(key1).not.toBe(key3);
        });
    });

    describe('HMAC Signature Verification', () => {
        it('should verify valid signature', () => {
            const payload = '{"message":"test"}';
            const secret = 'webhook-secret';

            // Create signature manually
            const crypto = require('crypto');
            const signature = crypto
                .createHmac('sha256', secret)
                .update(payload)
                .digest('hex');

            const isValid = verifySignature(payload, signature, secret);

            expect(isValid).toBe(true);
        });

        it('should reject invalid signature', () => {
            const payload = '{"message":"test"}';
            const secret = 'webhook-secret';
            const wrongSignature = 'invalid-signature-12345';

            const isValid = verifySignature(payload, wrongSignature, secret);

            expect(isValid).toBe(false);
        });

        it('should reject signature with tampered payload', () => {
            const payload = '{"message":"test"}';
            const secret = 'webhook-secret';

            const crypto = require('crypto');
            const signature = crypto
                .createHmac('sha256', secret)
                .update(payload)
                .digest('hex');

            // Tamper with payload
            const tamperedPayload = '{"message":"hacked"}';

            const isValid = verifySignature(tamperedPayload, signature, secret);

            expect(isValid).toBe(false);
        });

        it('should reject signature with wrong secret', () => {
            const payload = '{"message":"test"}';
            const secret = 'webhook-secret';

            const crypto = require('crypto');
            const signature = crypto
                .createHmac('sha256', secret)
                .update(payload)
                .digest('hex');

            const wrongSecret = 'wrong-secret';

            const isValid = verifySignature(payload, signature, wrongSecret);

            expect(isValid).toBe(false);
        });
    });

    describe('Encryption Performance', () => {
        it('should encrypt/decrypt 1000 operations under 1 second', () => {
            const startTime = Date.now();

            for (let i = 0; i < 1000; i++) {
                const plaintext = `api-key-${i}`;
                const encrypted = encrypt(plaintext);
                const decrypted = decrypt(
                    encrypted.encrypted,
                    encrypted.iv,
                    encrypted.authTag
                );

                if (decrypted !== plaintext) {
                    throw new Error('Decryption mismatch');
                }
            }

            const duration = Date.now() - startTime;

            expect(duration).toBeLessThan(1000);
        });
    });

    describe('Edge Cases', () => {
        it('should handle unicode characters', () => {
            const unicode = 'Hello 世界 🚀 Привет';

            const encrypted = encrypt(unicode);
            const decrypted = decrypt(
                encrypted.encrypted,
                encrypted.iv,
                encrypted.authTag
            );

            expect(decrypted).toBe(unicode);
        });

        it('should handle newlines and whitespace', () => {
            const multiline = 'line1\nline2\r\nline3\ttab';

            const encrypted = encrypt(multiline);
            const decrypted = decrypt(
                encrypted.encrypted,
                encrypted.iv,
                encrypted.authTag
            );

            expect(decrypted).toBe(multiline);
        });

        it('should handle JSON strings', () => {
            const json = JSON.stringify({ key: 'value', nested: { data: 123 } });

            const encrypted = encrypt(json);
            const decrypted = decrypt(
                encrypted.encrypted,
                encrypted.iv,
                encrypted.authTag
            );

            expect(decrypted).toBe(json);
            expect(JSON.parse(decrypted)).toEqual(JSON.parse(json));
        });
    });
});
