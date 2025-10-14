/**
 * Moomoo Connection Test
 * Tests actual connection to Moomoo OpenD Gateway
 *
 * Prerequisites:
 * 1. Moomoo OpenD Gateway must be running
 * 2. Logged into paper trading account
 * 3. OpenD Gateway listening on port 11111
 * 4. Account ID and password configured in .env
 */

const BrokerFactory = require('./src/brokers/BrokerFactory');

console.log('=== Moomoo Connection Test ===\n');

async function testConnection() {
  console.log('📋 Prerequisites Check:');
  console.log('   - Moomoo OpenD Gateway running?');
  console.log('   - Logged into paper trading account?');
  console.log('   - OpenD Gateway on port 11111?');
  console.log('   - MOOMOO_ID and MOOMOO_PASSWORD in .env?');
  console.log('');

  const moomoo = BrokerFactory.createBroker('moomoo', {
    accountId: process.env.MOOMOO_ID || '72635647',
    password: process.env.MOOMOO_PASSWORD,
    host: process.env.MOOMOO_HOST || '127.0.0.1',
    port: parseInt(process.env.MOOMOO_PORT) || 11111
  }, {
    isTestnet: process.env.MOOMOO_PAPER_TRADING === 'true'
  });

  console.log('🔌 Attempting connection...');
  console.log('   Host: ' + (process.env.MOOMOO_HOST || '127.0.0.1') + ':' + (process.env.MOOMOO_PORT || '11111'));
  console.log('   Account ID: ' + (process.env.MOOMOO_ID ? '***' + process.env.MOOMOO_ID.slice(-4) : 'Not configured'));
  console.log('   Paper Trading: ' + (process.env.MOOMOO_PAPER_TRADING === 'true') + '\n');

  try {
    // Test authentication
    console.log('⏳ Connecting to Moomoo OpenD Gateway...');
    await moomoo.authenticate();
    console.log('✅ Successfully connected to Moomoo!\n');

    // Test account balance
    console.log('⏳ Fetching account balance...');
    const balance = await moomoo.getBalance();
    console.log('✅ Account Balance Retrieved:');
    console.log('   Total Assets: $' + balance.total.toFixed(2));
    console.log('   Available Cash: $' + balance.available.toFixed(2));
    console.log('   Equity: $' + balance.equity.toFixed(2));
    console.log('   Currency:', balance.currency);
    console.log('');

    // Test market data
    console.log('⏳ Fetching market data for AAPL...');
    const price = await moomoo.getMarketPrice('AAPL');
    console.log('✅ Market Price Retrieved:');
    console.log('   Bid: $' + price.bid.toFixed(2));
    console.log('   Ask: $' + price.ask.toFixed(2));
    console.log('   Last: $' + price.last.toFixed(2));
    console.log('');

    // Test positions
    console.log('⏳ Fetching positions...');
    const positions = await moomoo.getPositions();
    console.log('✅ Positions Retrieved:');
    if (positions.length > 0) {
      console.log('   Found ' + positions.length + ' position(s)');
      positions.forEach(pos => {
        console.log('   - ' + pos.symbol + ': ' + pos.quantity + ' shares @ $' + pos.avgCost.toFixed(2));
      });
    } else {
      console.log('   No open positions');
    }
    console.log('');

    // Test connection status
    console.log('✅ Connection Status: Connected');
    console.log('✅ Authentication: Success');
    console.log('✅ Account Info: Retrieved');
    console.log('');

    // Cleanup
    console.log('🔌 Disconnecting...');
    await moomoo.disconnect();
    console.log('✅ Disconnected successfully');
    console.log('');

    console.log('=== ✅ All Tests Passed! ===');
    console.log('');
    console.log('🎉 Your Moomoo integration is working!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Keep OpenD Gateway running for API access');
    console.log('2. Try placing test orders with small quantities');
    console.log('3. Monitor orders in Moomoo desktop application');
    console.log('4. Check paper trading vs real trading mode carefully');
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
      console.error('  1. Is Moomoo OpenD Gateway running?');
      console.error('  2. Is OpenD Gateway logged in?');
      console.error('  3. Is port 11111 correct? (check OpenD Gateway settings)');
      console.error('  4. Try restarting OpenD Gateway');
      console.error('  5. Verify localhost connections are allowed');
    } else if (error.message.includes('authentication failed') || error.message.includes('unlock')) {
      console.error('Authentication Issue - Check:');
      console.error('  1. MOOMOO_PASSWORD in .env is correct');
      console.error('  2. Trading unlock password matches your account');
      console.error('  3. Account is enabled for API trading');
      console.error('  4. Try logging out and back into OpenD Gateway');
    } else if (error.message.includes('account') || error.message.includes('accID')) {
      console.error('Account Issue - Check:');
      console.error('  1. MOOMOO_ID in .env matches your account number');
      console.error('  2. Account is visible in OpenD Gateway');
      console.error('  3. Paper trading mode is correctly set');
      console.error('  4. Account has API trading permissions');
    } else {
      console.error('General Error - Check:');
      console.error('  1. OpenD Gateway is running and logged in');
      console.error('  2. .env configuration matches your account');
      console.error('  3. Firewall not blocking localhost connections');
      console.error('  4. moomoo-api npm package is installed');
      console.error('  5. Try: npm install moomoo-api');
    }

    console.error('');
    console.error('📖 OpenD Gateway Download: https://openapi.moomoo.com/');
    console.error('📖 API Documentation: https://openapi.moomoo.com/docs/');
    console.error('');

    process.exit(1);
  }
}

testConnection();
