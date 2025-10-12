#!/usr/bin/env node

/**
 * Redis Verification Script
 *
 * Verifies Redis connection and WebSocket adapter configuration
 * Run this after setting up Redis on Railway to ensure everything works
 *
 * Usage:
 *   node scripts/verify-redis.js
 *   REDIS_URL=redis://... node scripts/verify-redis.js
 */

const Redis = require('ioredis');

// Colors for terminal output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m'
};

const log = {
    success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
    error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
    warn: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
    info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`)
};

async function verifyRedis() {
    console.log('\n' + '='.repeat(60));
    console.log('Redis Configuration Verification');
    console.log('='.repeat(60) + '\n');

    // Check environment variables
    log.info('Checking environment configuration...');

    const redisUrl = process.env.REDIS_URL;
    const nodeEnv = process.env.NODE_ENV;

    if (!redisUrl) {
        log.error('REDIS_URL environment variable not set');
        log.info('Set REDIS_URL before running: REDIS_URL=redis://... node scripts/verify-redis.js');
        process.exit(1);
    }

    log.success(`REDIS_URL is set: ${redisUrl.replace(/\/\/[^@]+@/, '//***:***@')}`);
    log.success(`NODE_ENV: ${nodeEnv || 'development'}`);

    if (nodeEnv !== 'production') {
        log.warn('NODE_ENV is not "production" - Redis adapter will not be used in WebSocket server');
        log.info('Set NODE_ENV=production to enable Redis adapter');
    }

    console.log('');

    // Test Redis connection
    log.info('Testing Redis connection...');

    const redis = new Redis(redisUrl, {
        retryStrategy: (times) => {
            if (times > 3) {
                return null; // Stop retrying
            }
            return Math.min(times * 50, 2000);
        },
        maxRetriesPerRequest: 3
    });

    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            log.error('Connection timeout - Redis server not responding');
            redis.disconnect();
            resolve(false);
        }, 10000);

        redis.on('connect', () => {
            clearTimeout(timeout);
            log.success('Connected to Redis server');
            runTests(redis).then((success) => {
                redis.disconnect();
                resolve(success);
            });
        });

        redis.on('error', (err) => {
            clearTimeout(timeout);
            log.error(`Redis connection error: ${err.message}`);
            redis.disconnect();
            resolve(false);
        });
    });
}

async function runTests(redis) {
    console.log('');
    log.info('Running Redis functionality tests...');
    console.log('');

    let allPassed = true;

    // Test 1: PING
    try {
        const pong = await redis.ping();
        if (pong === 'PONG') {
            log.success('Test 1: PING/PONG - Success');
        } else {
            log.error(`Test 1: PING/PONG - Unexpected response: ${pong}`);
            allPassed = false;
        }
    } catch (error) {
        log.error(`Test 1: PING/PONG - Failed: ${error.message}`);
        allPassed = false;
    }

    // Test 2: SET/GET
    try {
        const testKey = 'websocket-test-key';
        const testValue = JSON.stringify({ timestamp: Date.now(), test: true });

        await redis.set(testKey, testValue);
        const retrieved = await redis.get(testKey);

        if (retrieved === testValue) {
            log.success('Test 2: SET/GET - Success');
            await redis.del(testKey); // Cleanup
        } else {
            log.error('Test 2: SET/GET - Value mismatch');
            allPassed = false;
        }
    } catch (error) {
        log.error(`Test 2: SET/GET - Failed: ${error.message}`);
        allPassed = false;
    }

    // Test 3: PUB/SUB (required for Socket.io adapter)
    try {
        const subscriber = redis.duplicate();
        const publisher = redis;

        const channel = 'websocket-test-channel';
        const message = JSON.stringify({ test: 'pub-sub-test', timestamp: Date.now() });

        const testPromise = new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(false), 5000);

            subscriber.subscribe(channel, (err) => {
                if (err) {
                    clearTimeout(timeout);
                    resolve(false);
                    return;
                }

                subscriber.on('message', (ch, msg) => {
                    if (ch === channel && msg === message) {
                        clearTimeout(timeout);
                        resolve(true);
                    }
                });

                // Publish after subscribe is confirmed
                setTimeout(() => {
                    publisher.publish(channel, message);
                }, 100);
            });
        });

        const success = await testPromise;

        if (success) {
            log.success('Test 3: PUB/SUB - Success');
        } else {
            log.error('Test 3: PUB/SUB - Failed or timeout');
            allPassed = false;
        }

        subscriber.disconnect();
    } catch (error) {
        log.error(`Test 3: PUB/SUB - Failed: ${error.message}`);
        allPassed = false;
    }

    // Test 4: Redis INFO
    try {
        const info = await redis.info('server');
        const version = info.match(/redis_version:([^\r\n]+)/)?.[1];

        if (version) {
            log.success(`Test 4: Redis INFO - Server version: ${version}`);
        } else {
            log.warn('Test 4: Redis INFO - Could not determine version');
        }
    } catch (error) {
        log.error(`Test 4: Redis INFO - Failed: ${error.message}`);
        allPassed = false;
    }

    console.log('');

    // Summary
    if (allPassed) {
        log.success('All Redis tests passed!');
        console.log('');
        log.info('Next steps:');
        console.log('  1. Ensure NODE_ENV=production in Railway');
        console.log('  2. Deploy your application');
        console.log('  3. Scale to 2+ replicas to test horizontal scaling');
        console.log('  4. Monitor logs for: "✅ WebSocket Redis adapter configured"');
        console.log('');
    } else {
        log.error('Some Redis tests failed');
        console.log('');
        log.info('Troubleshooting:');
        console.log('  1. Verify REDIS_URL is correct');
        console.log('  2. Check Redis server is running: railway logs -s redis');
        console.log('  3. Verify network connectivity');
        console.log('  4. Check Railway Redis service status');
        console.log('');
    }

    return allPassed;
}

// Run verification
verifyRedis().then((success) => {
    console.log('='.repeat(60) + '\n');
    process.exit(success ? 0 : 1);
}).catch((error) => {
    log.error(`Unexpected error: ${error.message}`);
    console.log('');
    console.log('='.repeat(60) + '\n');
    process.exit(1);
});
