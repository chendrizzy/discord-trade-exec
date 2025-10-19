#!/usr/bin/env node

/**
 * Redis Connection Test Script
 *
 * Tests Redis connectivity, basic operations, and pub/sub functionality.
 * Used for validating Railway Redis deployment.
 *
 * Usage:
 *   node scripts/test-redis-connection.js
 *   railway run node scripts/test-redis-connection.js
 */

const Redis = require('ioredis');

/**
 * Main test function
 */
const testRedisConnection = async () => {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    console.error('❌ REDIS_URL environment variable not set');
    console.log('\nSet REDIS_URL in your environment:');
    console.log('  export REDIS_URL="redis://default:password@host:port"');
    console.log('\nOr use Railway CLI:');
    console.log('  railway run node scripts/test-redis-connection.js');
    process.exit(1);
  }

  // Mask password in output
  const maskedUrl = redisUrl.replace(/:[^:]*@/, ':****@');
  console.log('🔍 Testing Redis connection...');
  console.log(`   URL: ${maskedUrl}\n`);

  const redis = new Redis(redisUrl, {
    retryStrategy: (times) => {
      if (times > 3) {
        console.error('❌ Failed to connect after 3 retries');
        return null;
      }
      return Math.min(times * 50, 2000);
    }
  });

  try {
    // Test 1: PING
    console.log('Test 1: PING');
    const pong = await redis.ping();
    console.log(`✅ Redis PING successful (response: ${pong})\n`);

    // Test 2: SET/GET
    console.log('Test 2: SET/GET');
    const testKey = `test-key-${Date.now()}`;
    const testValue = 'test-value-' + Math.random();
    await redis.set(testKey, testValue);
    const retrievedValue = await redis.get(testKey);

    if (retrievedValue === testValue) {
      console.log(`✅ Redis SET/GET successful`);
      console.log(`   Key: ${testKey}`);
      console.log(`   Value: ${testValue}\n`);
    } else {
      throw new Error(`Value mismatch: expected ${testValue}, got ${retrievedValue}`);
    }

    // Test 3: EXPIRE
    console.log('Test 3: EXPIRE');
    await redis.expire(testKey, 60);
    const ttl = await redis.ttl(testKey);
    console.log(`✅ Redis EXPIRE successful (TTL: ${ttl}s)\n`);

    // Test 4: DELETE
    console.log('Test 4: DELETE');
    await redis.del(testKey);
    const deleted = await redis.get(testKey);
    if (deleted === null) {
      console.log(`✅ Redis DELETE successful\n`);
    } else {
      throw new Error('Key was not deleted');
    }

    // Test 5: INCR (for rate limiting)
    console.log('Test 5: INCR (rate limiting simulation)');
    const counterKey = `test-counter-${Date.now()}`;
    const count1 = await redis.incr(counterKey);
    const count2 = await redis.incr(counterKey);
    const count3 = await redis.incr(counterKey);
    console.log(`✅ Redis INCR successful`);
    console.log(`   Count sequence: ${count1}, ${count2}, ${count3}\n`);
    await redis.del(counterKey);

    // Test 6: PUB/SUB (for Socket.io adapter)
    console.log('Test 6: PUB/SUB (Socket.io adapter simulation)');
    const subscriber = new Redis(redisUrl);
    const testChannel = `test-channel-${Date.now()}`;
    const testMessage = 'test-message-' + Math.random();

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('PUB/SUB test timeout'));
      }, 5000);

      subscriber.on('message', (channel, message) => {
        clearTimeout(timeout);

        if (channel === testChannel && message === testMessage) {
          console.log(`✅ Redis PUB/SUB successful`);
          console.log(`   Channel: ${testChannel}`);
          console.log(`   Message: ${message}\n`);
          subscriber.quit();
          resolve();
        } else {
          reject(new Error(`Message mismatch: expected ${testMessage}, got ${message}`));
        }
      });

      subscriber.subscribe(testChannel, (err) => {
        if (err) {
          clearTimeout(timeout);
          reject(err);
        } else {
          // Publish after subscription is confirmed
          redis.publish(testChannel, testMessage);
        }
      });
    });

    // Test 7: INFO (server information)
    console.log('Test 7: INFO (server information)');
    const info = await redis.info('server');
    const versionMatch = info.match(/redis_version:([^\r\n]+)/);
    const modeMatch = info.match(/redis_mode:([^\r\n]+)/);
    const osMatch = info.match(/os:([^\r\n]+)/);

    console.log('✅ Redis INFO successful');
    if (versionMatch) console.log(`   Version: ${versionMatch[1]}`);
    if (modeMatch) console.log(`   Mode: ${modeMatch[1]}`);
    if (osMatch) console.log(`   OS: ${osMatch[1]}\n`);

    // Test 8: Memory info
    console.log('Test 8: MEMORY INFO');
    const memoryInfo = await redis.info('memory');
    const usedMemoryMatch = memoryInfo.match(/used_memory_human:([^\r\n]+)/);
    const maxMemoryMatch = memoryInfo.match(/maxmemory_human:([^\r\n]+)/);

    console.log('✅ Redis memory info retrieved');
    if (usedMemoryMatch) console.log(`   Used memory: ${usedMemoryMatch[1]}`);
    if (maxMemoryMatch) console.log(`   Max memory: ${maxMemoryMatch[1]}\n`);

    // Test 9: Stats
    console.log('Test 9: STATS');
    const statsInfo = await redis.info('stats');
    const connectionsMatch = statsInfo.match(/total_connections_received:([^\r\n]+)/);
    const commandsMatch = statsInfo.match(/total_commands_processed:([^\r\n]+)/);

    console.log('✅ Redis stats retrieved');
    if (connectionsMatch) console.log(`   Total connections: ${connectionsMatch[1]}`);
    if (commandsMatch) console.log(`   Commands processed: ${commandsMatch[1]}\n`);

    // Success summary
    console.log('═══════════════════════════════════════════');
    console.log('✅ ALL REDIS TESTS PASSED');
    console.log('═══════════════════════════════════════════');
    console.log('\nRedis is ready for production use with:');
    console.log('  - Basic operations (GET/SET/DEL/EXPIRE/INCR)');
    console.log('  - Pub/Sub for Socket.io Redis adapter');
    console.log('  - Server monitoring and statistics');
    console.log('\nNext steps:');
    console.log('  1. Deploy to Railway');
    console.log('  2. Set REDIS_URL in Railway environment');
    console.log('  3. Run WebSocket server with Redis adapter');
    console.log('  4. Monitor Redis metrics in Railway dashboard\n');

    await redis.quit();
    process.exit(0);

  } catch (error) {
    console.error('❌ Redis test failed:', error.message);
    console.error('\nError details:', error);

    console.log('\nTroubleshooting:');
    console.log('  1. Check REDIS_URL format: redis://default:password@host:port');
    console.log('  2. Verify Redis service is running (Railway dashboard)');
    console.log('  3. Check network connectivity to Redis host');
    console.log('  4. Verify credentials are correct');
    console.log('  5. Check Railway Redis service logs\n');

    await redis.quit();
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the test
testRedisConnection();
