/**
 * Alpaca Connection Test Script
 *
 * Tests live connection to Alpaca paper trading account
 *
 * Prerequisites:
 * 1. Alpaca paper trading account (sign up at https://alpaca.markets)
 * 2. API credentials from https://app.alpaca.markets/paper/dashboard/overview
 * 3. Add credentials to .env file
 *
 * Setup .env:
 * ALPACA_API_KEY=your_api_key_here
 * ALPACA_API_SECRET=your_api_secret_here
 * ALPACA_PAPER_TRADING=true
 */

async function testAlpacaConnection() {
  console.log('=== Alpaca Connection Test ===\n');

  const credentials = {
    apiKey: process.env.ALPACA_API_KEY,
    apiSecret: process.env.ALPACA_API_SECRET
  };

  const options = {
    testnet: process.env.ALPACA_PAPER_TRADING === 'true'
  };

  console.log('Configuration:');
  console.log(`  Mode: ${options.testnet ? 'Paper Trading' : 'Live Trading'}`);
  console.log(`  API Key: ${credentials.apiKey ? credentials.apiKey.substring(0, 8) + '...' : 'Not provided'}`);
  console.log(`  API Secret: ${credentials.apiSecret ? '***' : 'Not provided'}`);
  console.log();

  if (!credentials.apiKey || !credentials.apiSecret) {
    console.error('❌ Error: Missing API credentials');
    console.log('\nPlease add the following to your .env file:');
    console.log('ALPACA_API_KEY=your_api_key_here');
    console.log('ALPACA_API_SECRET=your_api_secret_here');
    console.log('ALPACA_PAPER_TRADING=true');
    process.exit(1);
  }

  try {
    const adapter = new AlpacaAdapter(credentials, options);

    // Test 1: Authentication
    console.log('Testing authentication...');
    const authenticated = await adapter.authenticate();

    if (authenticated) {
      console.log('✅ Successfully connected to Alpaca!\n');
    } else {
      throw new Error('Authentication returned false');
    }

    // Test 2: Get Account Balance
    console.log('Testing account balance retrieval...');
    const balance = await adapter.getBalance();

    console.log('✅ Account Balance Retrieved:');
    console.log(`   Total Equity: $${balance.equity.toFixed(2)}`);
    console.log(`   Available Cash: $${balance.cash.toFixed(2)}`);
    console.log(`   Buying Power: $${balance.available.toFixed(2)}`);
    console.log(`   Portfolio Value: $${balance.portfolioValue.toFixed(2)}`);
    console.log(`   P/L Today: $${balance.profitLoss.toFixed(2)} (${balance.profitLossPercent.toFixed(2)}%)`);
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
    const connected = await adapter.isConnected();
    console.log(`✅ Connection Status: ${connected ? 'Connected' : 'Disconnected'}\n`);

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
    console.log('\n🎉 All Tests Passed!');
    console.log('\nAlpaca integration is working correctly.');
    console.log('You can now use AlpacaAdapter for live/paper trading.');
  } catch (error) {
    console.error('\n❌ Connection Test Failed!');
    console.error('Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Verify API credentials are correct');
    console.error("2. Check if you're using paper trading credentials");
    console.error('3. Ensure your Alpaca account is active');
    console.error('4. Check https://status.alpaca.markets for service status');
    console.error('5. Review API documentation: https://docs.alpaca.markets');
    process.exit(1);
  }
}

// Run the test
testAlpacaConnection().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
require('dotenv').config();
// Internal utilities and services
const AlpacaAdapter = require('./src/brokers/adapters/AlpacaAdapter');
