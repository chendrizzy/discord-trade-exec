/**
 * IBKR Connection Test
 * Tests actual connection to TWS/IB Gateway
 *
 * Prerequisites:
 * 1. IB Gateway or TWS must be running
 * 2. Logged into paper trading account
 * 3. API settings enabled (port 4001, client ID 1)
 */

const BrokerFactory = require('./src/brokers/BrokerFactory');

console.log('=== IBKR Connection Test ===\n');

async function testConnection() {
  console.log('📋 Prerequisites Check:');
  console.log('   - IB Gateway/TWS running?');
  console.log('   - Logged into paper trading?');
  console.log('   - API settings enabled (port 4001)?');
  console.log('');

  const ibkr = BrokerFactory.createBroker('ibkr', {
    clientId: 1,
    host: '127.0.0.1',
    port: 4001
  }, {
    isTestnet: true
  });

  console.log('🔌 Attempting connection...');
  console.log('   Host: 127.0.0.1:4001');
  console.log('   Client ID: 1');
  console.log('   Paper Trading: true\n');

  try {
    // Test authentication
    console.log('⏳ Connecting to IBKR...');
    await ibkr.authenticate();
    console.log('✅ Successfully connected to IBKR!\n');

    // Test account balance
    console.log('⏳ Fetching account balance...');
    const balance = await ibkr.getBalance();
    console.log('✅ Account Balance Retrieved:');
    console.log('   Total Equity: $' + balance.total.toFixed(2));
    console.log('   Available Cash: $' + balance.available.toFixed(2));
    console.log('   Buying Power: $' + balance.available.toFixed(2));
    console.log('   Currency:', balance.currency);
    console.log('');

    // Test connection status
    console.log('✅ Connection Status: Connected');
    console.log('✅ Authentication: Success');
    console.log('');

    // Cleanup
    console.log('🔌 Disconnecting...');
    await ibkr.disconnect();
    console.log('✅ Disconnected successfully');
    console.log('');

    console.log('=== ✅ All Tests Passed! ===');
    console.log('');
    console.log('🎉 Your IBKR integration is working!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Keep IB Gateway running for API access');
    console.log('2. Try placing test orders with small quantities');
    console.log('3. Monitor orders in IB Gateway interface');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('❌ Connection Failed!');
    console.error('Error:', error.message);
    console.error('');
    console.error('🔍 Troubleshooting:');
    console.error('');

    if (error.message.includes('timeout') || error.message.includes('ECONNREFUSED')) {
      console.error('Connection Issue - Check:');
      console.error('  1. Is IB Gateway/TWS running?');
      console.error('  2. Are you logged into paper trading mode?');
      console.error('  3. Is port 4001 correct in API settings?');
      console.error('  4. Did you restart IB Gateway after enabling API?');
    } else if (error.message.includes('Invalid client ID')) {
      console.error('Client ID Issue - Check:');
      console.error('  1. Master API client ID in TWS settings');
      console.error('  2. Should be 1 (or match your .env IBKR_CLIENT_ID)');
    } else if (error.message.includes('Socket Clients')) {
      console.error('API Not Enabled - Check:');
      console.error('  1. Enable "ActiveX and Socket Clients" in API settings');
      console.error('  2. Allow connections from localhost (127.0.0.1)');
      console.error('  3. Restart IB Gateway after changing settings');
    } else {
      console.error('General Error - Check:');
      console.error('  1. TWS/IB Gateway is running and logged in');
      console.error('  2. API settings match .env configuration');
      console.error('  3. Firewall not blocking localhost connections');
    }

    console.error('');
    console.error('📖 Full setup guide: docs/IBKR_SETUP_GUIDE.md');
    console.error('');

    process.exit(1);
  }
}

testConnection();
