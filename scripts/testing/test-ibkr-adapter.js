/**
 * Quick verification test for IBKRAdapter implementation
 * This verifies the adapter can be instantiated and basic methods exist
 * Does NOT require TWS/IB Gateway to be running
 */

// Internal utilities and services
const BrokerFactory = require('./src/brokers/BrokerFactory');

console.log('=== IBKR Adapter Verification Test ===\n');

// Test 1: Verify IBKR is registered in factory
console.log('Test 1: Checking IBKR registration in BrokerFactory...');
const stats = BrokerFactory.getStats();
console.log('Factory stats:', stats);

const ibkrInfo = BrokerFactory.getBrokerInfo('ibkr');
console.log('IBKR info:', JSON.stringify(ibkrInfo, null, 2));
console.log('✅ IBKR is registered\n');

// Test 2: Verify IBKR is marked as available
console.log('Test 2: Checking IBKR availability...');
const isAvailable = BrokerFactory.isBrokerAvailable('ibkr');
console.log(`IBKR available: ${isAvailable}`);
if (isAvailable) {
  console.log('✅ IBKR is marked as available\n');
} else {
  console.log('❌ IBKR is NOT available (status: ' + ibkrInfo.status + ')\n');
  process.exit(1);
}

// Test 3: Create IBKR adapter instance
console.log('Test 3: Creating IBKRAdapter instance...');
try {
  const ibkrAdapter = BrokerFactory.createBroker(
    'ibkr',
    {
      clientId: 1,
      host: '127.0.0.1',
      port: 4001
    },
    {
      isTestnet: true
    }
  );

  console.log('✅ IBKRAdapter instance created successfully');
  console.log('Broker name:', ibkrAdapter.brokerName);
  console.log('Broker type:', ibkrAdapter.brokerType);
  console.log('Is testnet:', ibkrAdapter.isTestnet);
  console.log('Client ID:', ibkrAdapter.clientId);
  console.log('Host:', ibkrAdapter.host);
  console.log('Port:', ibkrAdapter.port);
  console.log();

  // Test 4: Verify required methods exist
  console.log('Test 4: Verifying required BrokerAdapter methods...');
  const requiredMethods = [
    'authenticate',
    'getBalance',
    'createOrder',
    'cancelOrder',
    'getPositions',
    'getBrokerInfo',
    'normalizeSymbol',
    'denormalizeSymbol',
    'isConnected'
  ];

  const missingMethods = [];
  requiredMethods.forEach(method => {
    if (typeof ibkrAdapter[method] !== 'function') {
      missingMethods.push(method);
    }
  });

  if (missingMethods.length === 0) {
    console.log('✅ All required methods implemented:', requiredMethods.join(', '));
  } else {
    console.log('❌ Missing methods:', missingMethods.join(', '));
    process.exit(1);
  }
  console.log();

  // Test 5: Verify broker info method
  console.log('Test 5: Calling getBrokerInfo()...');
  const brokerInfo = ibkrAdapter.getBrokerInfo();
  console.log('Broker info:', JSON.stringify(brokerInfo, null, 2));
  console.log('✅ getBrokerInfo() works\n');

  // Test 6: Verify connection status (should be false initially)
  console.log('Test 6: Checking initial connection status...');
  const isConnected = ibkrAdapter.isConnected();
  console.log(`Is connected: ${isConnected}`);
  if (!isConnected) {
    console.log('✅ Initial connection status is false (expected)\n');
  } else {
    console.log('❌ Initial connection status should be false\n');
    process.exit(1);
  }

  console.log('=== All verification tests passed! ===');
  console.log('\nNote: These tests verify the adapter structure only.');
  console.log('To test actual IBKR API connectivity, TWS/IB Gateway must be running.');
  console.log('Run TWS and use adapter.authenticate() to test connection.\n');
} catch (error) {
  console.error('❌ Error creating IBKRAdapter:', error.message);
  console.error(error.stack);
  process.exit(1);
}
