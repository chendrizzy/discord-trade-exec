# Broker Adapter Testing Guide

This directory contains comprehensive integration tests for all broker adapters.

## 📋 Overview

The test suites validate:
- ✅ Authentication (OAuth & API keys)
- ✅ Account balance retrieval
- ✅ Order creation (market, limit, stop, stop-limit)
- ✅ Order cancellation and management
- ✅ Position tracking with P&L
- ✅ Risk management (stop-loss, take-profit)
- ✅ Market data retrieval
- ✅ Error handling and edge cases

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Paper Trading Credentials

#### **Alpaca Paper Trading Setup**

1. **Create a free Alpaca account** at [https://alpaca.markets](https://alpaca.markets)

2. **Navigate to Paper Trading Dashboard**:
   - Go to [https://app.alpaca.markets/paper/dashboard/overview](https://app.alpaca.markets/paper/dashboard/overview)

3. **Generate API Keys**:
   - Click "Generate New Key" in the API Keys section
   - Copy your `API Key ID` and `Secret Key`
   - **Important**: Paper trading keys are completely separate from live trading

4. **Set Environment Variables**:

   **Option A: Using `.env` file** (Recommended)
   ```bash
   # Create .env file in project root
   echo "ALPACA_PAPER_KEY=your_paper_api_key_here" >> .env
   echo "ALPACA_PAPER_SECRET=your_paper_secret_here" >> .env
   ```

   **Option B: Export directly** (For single session)
   ```bash
   export ALPACA_PAPER_KEY=your_paper_api_key_here
   export ALPACA_PAPER_SECRET=your_paper_secret_here
   ```

   **Option C: Add to `.bashrc` or `.zshrc`** (Permanent)
   ```bash
   echo 'export ALPACA_PAPER_KEY=your_paper_api_key_here' >> ~/.bashrc
   echo 'export ALPACA_PAPER_SECRET=your_paper_secret_here' >> ~/.bashrc
   source ~/.bashrc
   ```

### 3. Run Tests

```bash
# Run all broker tests
npm test -- src/brokers/adapters/__tests__

# Run only Alpaca tests
npm test -- src/brokers/adapters/__tests__/AlpacaAdapter.test.js

# Run with coverage
npm test -- --coverage src/brokers/adapters/__tests__

# Run in watch mode for development
npm test -- --watch src/brokers/adapters/__tests__
```

## 📊 Test Output

### With Credentials
```
PASS  src/brokers/adapters/__tests__/AlpacaAdapter.test.js
  AlpacaAdapter
    Initialization
      ✓ should create adapter with correct broker info (5 ms)
      ✓ should have correct base URL for paper trading (2 ms)
    Authentication
      ✓ should authenticate with API key credentials (350 ms)
      ✓ should fail authentication with invalid credentials (200 ms)
    Balance Operations
      ✓ should get account balance (120 ms)
    Order Creation
      ✓ should create market buy order (450 ms)
      ✓ should create limit sell order (380 ms)
    ...
```

### Without Credentials
```
PASS  src/brokers/adapters/__tests__/AlpacaAdapter.test.js
  AlpacaAdapter
    Initialization
      ✓ should create adapter with correct broker info (3 ms)
      ✓ should normalize symbols correctly (1 ms)
    OAuth Static Methods
      ✓ should generate OAuth authorization URL (2 ms)
    ...

⚠️  Alpaca paper trading credentials not found.
    Set ALPACA_PAPER_KEY and ALPACA_PAPER_SECRET to run integration tests.
```

> **Note**: Tests will skip API-dependent tests if credentials are missing but still validate all local logic.

## 🔧 Configuration

### Test Timeout
Default timeout is 30 seconds (configured in `jest.config.js`). Some tests may take longer during market hours:

```javascript
// Increase timeout for specific tests
jest.setTimeout(60000); // 60 seconds
```

### Paper Trading vs Live Trading

**⚠️ CRITICAL: These tests ONLY use paper trading APIs**

The tests are hardcoded to use `isTestnet: true`:
```javascript
const adapter = new AlpacaAdapter({
  apiKey: process.env.ALPACA_PAPER_KEY,
  apiSecret: process.env.ALPACA_PAPER_SECRET
}, {
  isTestnet: true  // Always paper trading
});
```

**Never run tests with live trading credentials!**

## 📁 Test Structure

```
src/brokers/adapters/__tests__/
├── README.md                    # This file
├── AlpacaAdapter.test.js       # Alpaca tests (stocks)
├── TDAmertradeAdapter.test.js  # TD Ameritrade (coming soon)
├── BinanceAdapter.test.js      # Binance (crypto)
└── CoinbaseAdapter.test.js     # Coinbase (crypto)
```

## 🧪 Test Coverage

### Current Coverage (AlpacaAdapter)

| Category | Methods Tested | Coverage |
|----------|---------------|----------|
| Authentication | OAuth, API Key | 100% |
| Orders | Market, Limit, Stop, Stop-Limit | 100% |
| Risk Management | Stop-Loss, Take-Profit, Trailing | 100% |
| Positions | Get, Track P&L | 100% |
| Market Data | Quotes, Symbol Validation | 100% |
| Error Handling | Invalid params, Network errors | 100% |

### Code Coverage Thresholds

From `jest.config.js`:
```javascript
coverageThreshold: {
  global: {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80
  }
}
```

Run with `--coverage` flag to generate detailed reports in `coverage/` directory.

## 🐛 Troubleshooting

### Issue: "Authentication failed: 401 Unauthorized"
**Solution**: Verify your API keys are correct and from the **Paper Trading** dashboard, not live trading.

### Issue: "Tests timeout"
**Solution**:
- Check your internet connection
- Alpaca API might be experiencing issues: [status.alpaca.markets](https://status.alpaca.markets)
- Market might be closed (though paper trading is 24/7, some features require market hours)

### Issue: "Order creation fails"
**Solution**:
- Ensure your paper trading account has sufficient buying power (default: $100,000)
- Check if the symbol is valid for the current market session
- Verify order parameters (price, quantity, etc.)

### Issue: "Tests skip all API-dependent tests"
**Solution**: Environment variables not loaded. Check:
```bash
# Verify credentials are set
echo $ALPACA_PAPER_KEY
echo $ALPACA_PAPER_SECRET

# If using .env file, ensure it's in project root
ls -la .env

# If still not working, try exporting directly
export ALPACA_PAPER_KEY=your_key_here
export ALPACA_PAPER_SECRET=your_secret_here
```

## 🔐 Security Best Practices

1. **Never commit credentials to Git**:
   ```bash
   # Add to .gitignore
   echo ".env" >> .gitignore
   echo ".env.local" >> .gitignore
   ```

2. **Use paper trading for all tests**:
   - Paper trading keys are FREE and risk-free
   - Reset paper account anytime from dashboard
   - No financial risk during development

3. **Rotate keys regularly**:
   - Generate new API keys every 90 days
   - Delete old keys from Alpaca dashboard
   - Update environment variables

4. **Store secrets securely**:
   - Use environment variables, not hardcoded values
   - Consider using a secrets manager for CI/CD
   - Never share API keys in chat, email, or screenshots

## 📚 Additional Resources

### Alpaca Documentation
- [API Documentation](https://docs.alpaca.markets/docs/trading-api)
- [OAuth Guide](https://docs.alpaca.markets/docs/oauth-guide)
- [Paper Trading](https://docs.alpaca.markets/docs/paper-trading)
- [Market Data API](https://docs.alpaca.markets/docs/market-data)

### Testing Best Practices
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Integration Testing Guide](https://kentcdodds.com/blog/write-tests)
- [API Testing Strategies](https://martinfowler.com/articles/microservice-testing/)

## 🤝 Contributing

When adding new broker adapters:

1. **Create test file**: `[BrokerName]Adapter.test.js`
2. **Follow test structure**: Copy AlpacaAdapter.test.js as template
3. **Add credentials guide**: Update this README with setup steps
4. **Ensure paper trading**: Always use testnet/sandbox mode
5. **Handle missing credentials**: Tests should skip gracefully
6. **Document edge cases**: Add specific broker quirks to README

### Test Checklist

- [ ] All BrokerAdapter methods tested
- [ ] Both authentication methods tested (if applicable)
- [ ] Order lifecycle tested (create → fill → cancel)
- [ ] Error scenarios tested
- [ ] Edge cases documented
- [ ] Paper trading confirmed
- [ ] Credentials setup documented
- [ ] Coverage threshold met (80%+)

## 📝 License

Tests are part of the Discord Trade Executor SaaS Platform.
See main project LICENSE for details.
