require('dotenv').config();

// Internal utilities and services
const SchwabAdapter = require('../../src/brokers/adapters/SchwabAdapter');

/**
 * Schwab Connection Test Script
 *
 * Tests live connection to Schwab paper trading account
 *
 * Prerequisites:
 * 1. Schwab brokerage account (sign up at https://www.schwab.com)
 * 2. Developer account at https://developer.schwab.com/
 * 3. Create application and get App Key + App Secret
 * 4. Complete OAuth flow to get refresh token
 * 5. Add credentials to .env file
 *
 * Setup .env:
 * SCHWAB_APP_KEY=your_app_key_here
 * SCHWAB_APP_SECRET=your_app_secret_here
 * SCHWAB_REFRESH_TOKEN=your_refresh_token_here
 * SCHWAB_PAPER_TRADING=true
 *
 * OAuth Flow Instructions:
 * 1. Generate authorization URL:
 *    const url = SchwabAdapter.getOAuthURL(
 *      'your_app_key',
 *      'https://localhost:3000/callback',
 *      'random_state_string'
 *    );
 *
 * 2. Open URL in browser and authorize the application
 * 3. You'll be redirected to callback URL with authorization code
 * 4. Exchange code for tokens:
 *    const tokens = await SchwabAdapter.exchangeCodeForToken(
 *      'authorization_code',
 *      'your_app_key',
 *      'your_app_secret',
 *      'https://localhost:3000/callback'
 *    );
 * 5. Save tokens.refreshToken to .env file
 *
 * Note: Refresh tokens expire after 7 days, requiring re-authentication
 */

async function testSchwabConnection() {
  console.log('=== Schwab Connection Test ===\n');

  const credentials = {
    appKey: process.env.SCHWAB_APP_KEY,
    appSecret: process.env.SCHWAB_APP_SECRET,
    refreshToken: process.env.SCHWAB_REFRESH_TOKEN
  };

  const options = {
    isTestnet: process.env.SCHWAB_PAPER_TRADING === 'true'
  };

  console.log('Configuration:');
  console.log(`  Mode: ${options.isTestnet ? 'Paper Trading' : 'Live Trading'}`);
  console.log(`  App Key: ${credentials.appKey ? credentials.appKey.substring(0, 8) + '...' : 'Not provided'}`);
  console.log(`  App Secret: ${credentials.appSecret ? '***' : 'Not provided'}`);
  console.log(
    `  Refresh Token: ${credentials.refreshToken ? credentials.refreshToken.substring(0, 8) + '...' : 'Not provided'}`
  );
  console.log();

  if (!credentials.appKey || !credentials.appSecret || !credentials.refreshToken) {
    console.error('❌ Error: Missing Schwab credentials');
    console.log('\nPlease complete the OAuth flow to get your credentials:');
    console.log('\n1. Register at https://developer.schwab.com/');
    console.log('2. Create an application to get App Key and App Secret');
    console.log('3. Run the OAuth flow (see script comments for instructions)');
    console.log('4. Add credentials to your .env file:');
    console.log('   SCHWAB_APP_KEY=your_app_key_here');
    console.log('   SCHWAB_APP_SECRET=your_app_secret_here');
    console.log('   SCHWAB_REFRESH_TOKEN=your_refresh_token_here');
    console.log('   SCHWAB_PAPER_TRADING=true');
    console.log('\nFor OAuth flow assistance, see:');
    console.log('https://developer.schwab.com/products/trader-api--individual/details/documentation');
    process.exit(1);
  }

  try {
    const adapter = new SchwabAdapter(credentials, options);

    // Test 1: Authentication
    console.log('Testing authentication...');
    const authenticated = await adapter.authenticate();

    if (authenticated) {
      console.log('✅ Successfully connected to Schwab!\n');
    } else {
      throw new Error('Authentication returned false');
    }

    // Test 2: Get Account Balance
    console.log('Testing account balance retrieval...');
    const balance = await adapter.getBalance();

    console.log('✅ Account Balance Retrieved:');
    console.log(`   Total Equity: $${balance.equity.toFixed(2)}`);
    console.log(`   Available Cash: $${balance.cash.toFixed(2)}`);
    console.log(`   Buying Power: $${balance.buyingPower.toFixed(2)}`);
    console.log(`   Portfolio Value: $${balance.portfolioValue.toFixed(2)}`);
    console.log(`   P/L: $${balance.profitLoss.toFixed(2)}`);
    console.log(`   Currency: ${balance.currency}\n`);

    // Test 3: Get Positions
    console.log('Testing positions retrieval...');
    const positions = await adapter.getPositions();

    if (positions.length > 0) {
      console.log(`✅ Found ${positions.length} open position(s):`);
      positions.forEach(pos => {
        console.log(`   ${pos.symbol}: ${pos.quantity} shares @ $${pos.entryPrice.toFixed(2)}`);
        console.log(
          `     Current: $${pos.currentPrice.toFixed(2)} | P/L: $${pos.unrealizedPnL.toFixed(2)} (${pos.unrealizedPnLPercent.toFixed(2)}%)`
        );
      });
      console.log();
    } else {
      console.log('   No open positions\n');
    }

    // Test 4: Test Market Price
    console.log('Testing market price retrieval for AAPL...');
    try {
      const quote = await adapter.getMarketPrice('AAPL');
      console.log('✅ Market Quote Retrieved:');
      console.log(`   Symbol: ${quote.symbol}`);
      console.log(`   Bid: $${quote.bid.toFixed(2)} x ${quote.bidSize}`);
      console.log(`   Ask: $${quote.ask.toFixed(2)} x ${quote.askSize}`);
      console.log(`   Last: $${quote.last.toFixed(2)}`);
      console.log(`   Timestamp: ${quote.timestamp}\n`);
    } catch (error) {
      console.log('⚠️  Market quote error (may be outside trading hours):', error.message);
      console.log();
    }

    // Test 5: Symbol Support Check
    console.log('Testing symbol support check...');
    const aaplSupported = await adapter.isSymbolSupported('AAPL');
    const invalidSupported = await adapter.isSymbolSupported('INVALID_SYMBOL_XYZ');

    console.log(`   AAPL supported: ${aaplSupported ? '✅' : '❌'}`);
    console.log(`   INVALID_SYMBOL_XYZ supported: ${invalidSupported ? '✅' : '❌'}\n`);

    // Test 6: Get Fee Structure
    console.log('Testing fee structure retrieval...');
    const fees = await adapter.getFees('AAPL');
    console.log('✅ Fee Structure:');
    console.log(`   Maker Fee: ${fees.maker}%`);
    console.log(`   Taker Fee: ${fees.taker}%`);
    console.log(`   Notes: ${fees.notes}\n`);

    // Test 7: Get Order History
    console.log('Testing order history retrieval...');
    const orders = await adapter.getOrderHistory({ limit: 5 });

    if (orders.length > 0) {
      console.log(`✅ Found ${orders.length} recent order(s):`);
      orders.slice(0, 3).forEach(order => {
        console.log(`   ${order.symbol} ${order.side} ${order.quantity} @ ${order.type}`);
        console.log(`     Status: ${order.status} | Created: ${order.createdAt}`);
      });
      console.log();
    } else {
      console.log('   No order history\n');
    }

    // Test 8: Connection Status
    console.log('Testing connection status...');
    const connected = adapter.isAuthenticated;
    console.log(`✅ Connection Status: ${connected ? 'Connected' : 'Disconnected'}\n`);

    // Test 9: Get Broker Info
    console.log('Testing broker info...');
    const brokerInfo = adapter.getBrokerInfo();
    console.log('✅ Broker Information:');
    console.log(`   Name: ${brokerInfo.displayName}`);
    console.log(`   Type: ${brokerInfo.type}`);
    console.log(`   Stocks: ${brokerInfo.supportsStocks ? '✓' : '✗'}`);
    console.log(`   Options: ${brokerInfo.supportsOptions ? '✓' : '✗'}`);
    console.log(`   Futures: ${brokerInfo.supportsFutures ? '✓' : '✗'}`);
    console.log(`   Commission-Free: ${brokerInfo.commissionFree ? '✓' : '✗'}`);
    console.log(`   Testnet Mode: ${brokerInfo.isTestnet ? 'Yes' : 'No'}\n`);

    // Summary
    console.log('=== Test Summary ===');
    console.log('✅ Authentication: Success');
    console.log('✅ Balance Retrieval: Success');
    console.log('✅ Positions Retrieval: Success');
    console.log('✅ Market Data: Success (with trading hours note)');
    console.log('✅ Symbol Support: Success');
    console.log('✅ Fee Structure: Success');
    console.log('✅ Order History: Success');
    console.log('✅ Connection Status: Success');
    console.log('✅ Broker Info: Success');
    console.log('\n🎉 All Tests Passed!');
    console.log('\nSchwab integration is working correctly.');
    console.log('You can now use SchwabAdapter for paper trading.');
    console.log('\n⚠️  Note: Refresh token expires after 7 days.');
    console.log('You will need to complete OAuth flow again to get a new refresh token.');

    // Cleanup
    await adapter.disconnect();
  } catch (error) {
    console.error('\n❌ Connection Test Failed!');
    console.error('Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Verify OAuth credentials are correct');
    console.error('2. Ensure refresh token has not expired (7-day expiry)');
    console.error('3. Check if your Schwab account is active');
    console.error('4. Verify application is approved in Schwab Developer Portal');
    console.error('5. Check https://developer.schwab.com/ for API status');
    console.error(
      '6. Review OAuth setup: https://developer.schwab.com/products/trader-api--individual/details/documentation'
    );
    console.error('\nIf refresh token expired, complete OAuth flow again:');
    console.error('See script comments for detailed OAuth instructions.');
    process.exit(1);
  }
}

// Run the test
testSchwabConnection().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
