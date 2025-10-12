const ccxt = require('ccxt');
const { BrokerFactory } = require('./brokers');

/**
 * Unified Trade Executor supporting both stock brokers (via BrokerFactory) and crypto exchanges (via CCXT)
 *
 * Features:
 * - Multi-broker/exchange support (Alpaca stocks, Binance crypto, etc.)
 * - Comprehensive risk management
 * - Position sizing (fixed, risk-based, Kelly criterion)
 * - Automated stop-loss and take-profit
 * - Daily loss limits and trading hours
 * - Demo mode support
 */
class TradeExecutor {
    constructor() {
        // Initialize crypto exchanges via CCXT
        this.exchanges = this.initializeExchanges();

        // Initialize stock brokers via BrokerFactory
        this.brokers = {};
        this.initializeBrokers();
    }

    /**
     * Initialize CCXT crypto exchanges
     */
    initializeExchanges() {
        const exchanges = {};

        // Initialize Binance
        if (process.env.BINANCE_API_KEY) {
            exchanges.binance = new ccxt.binance({
                apiKey: process.env.BINANCE_API_KEY,
                secret: process.env.BINANCE_SECRET,
                sandbox: process.env.NODE_ENV !== 'production'
            });
        }

        // Add more crypto exchanges as needed
        return exchanges;
    }

    /**
     * Initialize stock brokers via BrokerFactory
     */
    initializeBrokers() {
        // Initialize Alpaca if credentials are available
        if (process.env.ALPACA_API_KEY && process.env.ALPACA_SECRET) {
            try {
                this.brokers.alpaca = BrokerFactory.createBroker('alpaca', {
                    apiKey: process.env.ALPACA_API_KEY,
                    apiSecret: process.env.ALPACA_SECRET
                }, {
                    isTestnet: process.env.NODE_ENV !== 'production'
                });
            } catch (error) {
                console.error('Failed to initialize Alpaca broker:', error.message);
            }
        }

        // OAuth-based Alpaca (if user has OAuth token)
        if (process.env.ALPACA_OAUTH_TOKEN) {
            try {
                this.brokers.alpaca_oauth = BrokerFactory.createBroker('alpaca', {
                    accessToken: process.env.ALPACA_OAUTH_TOKEN
                }, {
                    isTestnet: process.env.NODE_ENV !== 'production'
                });
            } catch (error) {
                console.error('Failed to initialize Alpaca OAuth broker:', error.message);
            }
        }

        console.log(`✅ Initialized ${Object.keys(this.brokers).length} stock broker(s)`);
    }

    /**
     * Add a broker instance dynamically (for user-specific brokers)
     * @param {string} brokerKey - Unique key for this broker instance
     * @param {string} brokerType - Broker type ('alpaca', 'ibkr', etc.)
     * @param {Object} credentials - Broker credentials
     * @param {Object} options - Broker options
     */
    async addBroker(brokerKey, brokerType, credentials, options = {}) {
        try {
            const broker = BrokerFactory.createBroker(brokerType, credentials, options);
            await broker.authenticate();
            this.brokers[brokerKey] = broker;
            console.log(`✅ Added broker: ${brokerKey} (${brokerType})`);
            return { success: true, brokerKey };
        } catch (error) {
            console.error(`Failed to add broker ${brokerKey}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Detect if a symbol is a stock or crypto
     * @param {string} symbol - Trading symbol (e.g., 'AAPL', 'BTC/USDT')
     * @returns {string} - 'stock' or 'crypto'
     */
    detectAssetType(symbol) {
        // Crypto symbols typically contain a slash (BTC/USDT) or are known crypto symbols
        const cryptoPattern = /\//; // Contains slash
        const knownCryptoSymbols = ['BTC', 'ETH', 'USDT', 'BNB', 'XRP', 'ADA', 'SOL', 'DOGE', 'MATIC'];

        if (cryptoPattern.test(symbol)) {
            return 'crypto';
        }

        const baseSymbol = symbol.split('/')[0].toUpperCase();
        if (knownCryptoSymbols.includes(baseSymbol)) {
            return 'crypto';
        }

        // Default to stock for single symbols like AAPL, TSLA, etc.
        return 'stock';
    }

    /**
     * Get trading adapter (broker or exchange) for a symbol
     * @param {string} symbol - Trading symbol
     * @param {string} preferredAdapter - User's preferred broker/exchange key
     * @returns {Object} - { adapter, type: 'broker'|'exchange', key: string }
     */
    getTradingAdapter(symbol, preferredAdapter = null) {
        const assetType = this.detectAssetType(symbol);

        // If user specified a preferred adapter, try to use it
        if (preferredAdapter) {
            if (this.brokers[preferredAdapter]) {
                return { adapter: this.brokers[preferredAdapter], type: 'broker', key: preferredAdapter };
            }
            if (this.exchanges[preferredAdapter]) {
                return { adapter: this.exchanges[preferredAdapter], type: 'exchange', key: preferredAdapter };
            }
        }

        // Auto-select based on asset type
        if (assetType === 'stock') {
            // Prefer OAuth broker if available, otherwise use API key broker
            const alpacaBroker = this.brokers.alpaca_oauth || this.brokers.alpaca;
            if (alpacaBroker) {
                return { adapter: alpacaBroker, type: 'broker', key: 'alpaca' };
            }
            throw new Error('No stock broker available. Please configure Alpaca credentials.');
        } else {
            // For crypto, use the first available exchange
            const exchangeKey = Object.keys(this.exchanges)[0];
            if (exchangeKey) {
                return { adapter: this.exchanges[exchangeKey], type: 'exchange', key: exchangeKey };
            }
            throw new Error('No crypto exchange available. Please configure exchange credentials.');
        }
    }

    /**
     * Execute a trade with comprehensive risk management validation
     * @param {Object} signal - Trading signal with symbol, action, price, etc.
     * @param {Object} user - User model instance with risk management settings
     * @param {Object} options - Additional execution options
     * @param {string} options.preferredBroker - Preferred broker/exchange key
     * @returns {Object} Execution result
     */
    async executeTrade(signal, user, options = {}) {
        try {
            // DEMO MODE: Simulate trades without calling exchange/broker
            if (process.env.DEMO_MODE === 'true') {
                console.log('🎭 DEMO MODE: Simulating trade execution');
                return {
                    success: true,
                    orderId: `DEMO-${Date.now()}`,
                    symbol: signal.symbol,
                    amount: 0.001,
                    price: signal.price,
                    action: signal.action,
                    demo: true,
                    assetType: this.detectAssetType(signal.symbol)
                };
            }

            // Validate user is provided
            if (!user) {
                return { success: false, reason: 'User instance required for risk management' };
            }

            // Risk management validation
            const riskCheck = await this.performRiskValidation(signal, user);
            if (!riskCheck.allowed) {
                console.log(`❌ Trade rejected: ${riskCheck.reason}`);
                return { success: false, reason: riskCheck.reason, riskRejection: true };
            }

            // Get appropriate trading adapter (broker or exchange)
            const { adapter, type, key } = this.getTradingAdapter(signal.symbol, options.preferredBroker);
            console.log(`📊 Using ${type}: ${key} for ${signal.symbol}`);

            // Get account balance for position size calculation
            const balance = await this.getAccountBalance(adapter, type, signal.symbol);

            // Calculate position size based on user's risk settings
            const positionData = this.calculatePositionSize(signal, user, balance);

            console.log(`📊 Position calculation:`, positionData);

            // Execute the trade based on adapter type
            let order;
            if (type === 'broker') {
                // Use BrokerAdapter interface
                order = await adapter.createOrder({
                    symbol: signal.symbol,
                    side: signal.action.toUpperCase(),
                    type: signal.orderType || 'MARKET',
                    quantity: positionData.positionSize,
                    timeInForce: signal.timeInForce || 'GTC'
                });

                console.log(`✅ Trade executed via ${key}: ${signal.action} ${positionData.positionSize} ${signal.symbol} @ ${order.executedPrice || signal.price}`);
            } else {
                // Use CCXT exchange interface
                order = await adapter.createOrder(
                    signal.symbol,
                    'market',
                    signal.action,
                    positionData.positionSize
                );

                console.log(`✅ Trade executed via ${key}: ${signal.action} ${positionData.positionSize} ${signal.symbol} @ ${order.price || signal.price}`);
            }

            // Set stop loss and take profit
            if (signal.stopLoss || user.tradingConfig.riskManagement.defaultStopLoss) {
                await this.setStopLoss(adapter, type, signal, order, user, positionData);
            }

            if (signal.takeProfit || user.tradingConfig.riskManagement.defaultTakeProfit) {
                await this.setTakeProfit(adapter, type, signal, order, user, positionData);
            }

            // Track daily loss/profit
            await this.trackTradeResult(user, order, positionData);

            return {
                success: true,
                orderId: order.orderId || order.id,
                symbol: signal.symbol,
                amount: positionData.positionSize,
                price: order.executedPrice || order.price,
                action: signal.action,
                riskAmount: positionData.riskAmount,
                stopLoss: signal.stopLoss || this.calculateDefaultStopLoss(signal, user),
                broker: key,
                assetType: this.detectAssetType(signal.symbol)
            };

        } catch (error) {
            console.error('Trade execution error:', error);
            return { success: false, reason: error.message };
        }
    }

    /**
     * Perform comprehensive risk validation checks
     */
    async performRiskValidation(signal, user) {
        const riskSettings = user.tradingConfig.riskManagement;

        // 1. Check daily loss limit
        const dailyLossCheck = user.checkDailyLossLimit();
        if (!dailyLossCheck.allowed) {
            return { allowed: false, reason: dailyLossCheck.reason };
        }

        // 2. Check trading hours
        const tradingHoursCheck = user.checkTradingHours();
        if (!tradingHoursCheck.allowed) {
            return { allowed: false, reason: tradingHoursCheck.reason };
        }

        // 3. Check max open positions
        const openPositions = await this.getOpenPositions(user, signal.symbol);
        if (openPositions.length >= riskSettings.maxOpenPositions) {
            return {
                allowed: false,
                reason: `Max open positions reached (${openPositions.length}/${riskSettings.maxOpenPositions})`
            };
        }

        // 4. Check max positions per symbol
        const symbolPositions = openPositions.filter(p => p.symbol === signal.symbol);
        if (symbolPositions.length >= riskSettings.maxPositionsPerSymbol) {
            return {
                allowed: false,
                reason: `Max positions for ${signal.symbol} reached (${symbolPositions.length}/${riskSettings.maxPositionsPerSymbol})`
            };
        }

        // 5. Validate signal has minimum required data
        if (!signal.symbol || !signal.action) {
            return { allowed: false, reason: 'Invalid signal: missing symbol or action' };
        }

        return { allowed: true };
    }

    /**
     * Calculate position size based on user's risk management settings
     */
    calculatePositionSize(signal, user, balance) {
        const riskSettings = user.tradingConfig.riskManagement;
        const accountBalance = balance.total || 10000; // Default fallback for demo

        // Determine stop loss price
        const entryPrice = signal.price;
        const stopLossPrice = signal.stopLoss || this.calculateDefaultStopLoss(signal, user);

        // Use user's position sizing method
        let positionSize;

        switch (riskSettings.positionSizingMethod) {
            case 'fixed':
                // Fixed percentage of portfolio
                positionSize = accountBalance * riskSettings.maxPositionSize;
                break;

            case 'risk_based':
                // Risk-based: calculate based on stop loss distance
                const calculation = user.calculatePositionSize(accountBalance, entryPrice, stopLossPrice);
                positionSize = calculation.positionSize;
                break;

            case 'kelly':
                // Kelly Criterion: f* = (bp - q) / b
                // Simplified Kelly - would need historical win rate
                const winRate = 0.6; // Placeholder - should use actual stats
                const avgWin = 0.02;
                const avgLoss = 0.01;
                const kellyPercentage = ((winRate * avgWin) - ((1 - winRate) * avgLoss)) / avgWin;
                positionSize = accountBalance * Math.max(0, Math.min(kellyPercentage, riskSettings.maxPositionSize));
                break;

            default:
                positionSize = accountBalance * riskSettings.maxPositionSize;
        }

        // Convert dollar amount to units of the asset
        const units = positionSize / entryPrice;

        // Calculate risk amount
        const stopLossDistance = Math.abs(entryPrice - stopLossPrice) / entryPrice;
        const riskAmount = positionSize * stopLossDistance;

        return {
            positionSize: units,
            positionValue: positionSize,
            riskAmount: riskAmount,
            stopLossDistance: stopLossDistance * 100,
            accountBalance: accountBalance
        };
    }

    /**
     * Calculate default stop loss price based on user settings
     */
    calculateDefaultStopLoss(signal, user) {
        const riskSettings = user.tradingConfig.riskManagement;
        const stopLossPercent = riskSettings.defaultStopLoss;

        if (signal.action === 'buy') {
            return signal.price * (1 - stopLossPercent);
        } else {
            return signal.price * (1 + stopLossPercent);
        }
    }

    /**
     * Calculate default take profit price based on user settings
     */
    calculateDefaultTakeProfit(signal, user) {
        const riskSettings = user.tradingConfig.riskManagement;
        const takeProfitPercent = riskSettings.defaultTakeProfit;

        if (signal.action === 'buy') {
            return signal.price * (1 + takeProfitPercent);
        } else {
            return signal.price * (1 - takeProfitPercent);
        }
    }

    /**
     * Set stop loss order with optional trailing stop
     */
    async setStopLoss(adapter, type, signal, order, user, positionData) {
        try {
            const riskSettings = user.tradingConfig.riskManagement;
            const stopLossPrice = signal.stopLoss || this.calculateDefaultStopLoss(signal, user);

            if (type === 'broker') {
                // Use BrokerAdapter interface
                const stopLossParams = {
                    symbol: signal.symbol,
                    quantity: positionData.positionSize,
                    side: signal.action === 'buy' ? 'SELL' : 'BUY',
                    stopPrice: stopLossPrice,
                    type: riskSettings.useTrailingStop ? 'TRAILING_STOP' : 'STOP'
                };

                if (riskSettings.useTrailingStop) {
                    stopLossParams.trailPercent = riskSettings.trailingStopPercent * 100;
                }

                await adapter.setStopLoss(stopLossParams);
            } else {
                // Use CCXT exchange interface
                const stopOrderParams = {
                    stopPrice: stopLossPrice
                };

                if (riskSettings.useTrailingStop) {
                    stopOrderParams.trailingPercent = riskSettings.trailingStopPercent * 100;
                }

                await adapter.createOrder(
                    signal.symbol,
                    'stop_market',
                    signal.action === 'buy' ? 'sell' : 'buy',
                    positionData.positionSize,
                    null,
                    stopOrderParams
                );
            }

            console.log(`🛡️ Stop loss set at ${stopLossPrice} ${riskSettings.useTrailingStop ? '(trailing)' : ''}`);
        } catch (error) {
            console.error('Stop loss error:', error.message);
        }
    }

    /**
     * Set take profit order
     */
    async setTakeProfit(adapter, type, signal, order, user, positionData) {
        try {
            const takeProfitPrice = signal.takeProfit || this.calculateDefaultTakeProfit(signal, user);

            if (type === 'broker') {
                // Use BrokerAdapter interface
                await adapter.setTakeProfit({
                    symbol: signal.symbol,
                    quantity: positionData.positionSize,
                    side: signal.action === 'buy' ? 'SELL' : 'BUY',
                    limitPrice: takeProfitPrice
                });
            } else {
                // Use CCXT exchange interface
                await adapter.createOrder(
                    signal.symbol,
                    'limit',
                    signal.action === 'buy' ? 'sell' : 'buy',
                    positionData.positionSize,
                    takeProfitPrice
                );
            }

            console.log(`🎯 Take profit set at ${takeProfitPrice}`);
        } catch (error) {
            console.error('Take profit error:', error.message);
        }
    }

    /**
     * Track trade result for daily loss/profit tracking
     */
    async trackTradeResult(user, order, positionData) {
        try {
            // Track the risk exposure (will be updated when position closes)
            const riskAmount = positionData.riskAmount / positionData.accountBalance;
            await user.recordDailyLoss(riskAmount);
            console.log(`📈 Risk exposure tracked: ${(riskAmount * 100).toFixed(2)}%`);
        } catch (error) {
            console.error('Error tracking trade result:', error);
        }
    }

    /**
     * Get account balance from broker or exchange
     */
    async getAccountBalance(adapter, type, symbol) {
        try {
            if (type === 'broker') {
                // Use BrokerAdapter interface
                const balance = await adapter.getBalance();
                return {
                    total: balance.total || balance.equity,
                    free: balance.available,
                    used: balance.total - balance.available
                };
            } else {
                // Use CCXT exchange interface
                const balance = await adapter.fetchBalance();
                const currency = symbol.split('/')[1] || 'USDT';
                return {
                    total: balance[currency]?.total || 10000,
                    free: balance[currency]?.free || 10000,
                    used: balance[currency]?.used || 0
                };
            }
        } catch (error) {
            console.error('Error fetching balance:', error);
            // Return demo balance on error
            return { total: 10000, free: 10000, used: 0 };
        }
    }

    /**
     * Get open positions for the user
     */
    async getOpenPositions(user, symbol = null) {
        try {
            const assetType = symbol ? this.detectAssetType(symbol) : null;
            const allPositions = [];

            // Get positions from brokers (stocks)
            if (!assetType || assetType === 'stock') {
                for (const [key, broker] of Object.entries(this.brokers)) {
                    try {
                        const positions = await broker.getPositions();
                        allPositions.push(...positions.map(p => ({ ...p, source: key })));
                    } catch (error) {
                        console.error(`Error fetching positions from ${key}:`, error.message);
                    }
                }
            }

            // Get positions from exchanges (crypto)
            if (!assetType || assetType === 'crypto') {
                for (const [key, exchange] of Object.entries(this.exchanges)) {
                    try {
                        const positions = await exchange.fetchPositions();
                        allPositions.push(...positions.map(p => ({
                            symbol: p.symbol,
                            quantity: p.contracts,
                            side: p.side,
                            entryPrice: p.entryPrice,
                            currentPrice: p.markPrice,
                            unrealizedPnL: p.unrealizedPnl,
                            source: key
                        })));
                    } catch (error) {
                        console.error(`Error fetching positions from ${key}:`, error.message);
                    }
                }
            }

            // Filter by symbol if provided
            if (symbol) {
                return allPositions.filter(p => p.symbol === symbol);
            }

            return allPositions;
        } catch (error) {
            console.error('Error fetching open positions:', error);
            return [];
        }
    }

    /**
     * Close a position with optional percentage
     */
    async closePosition(symbol, user, percentage = 100, preferredAdapter = null) {
        try {
            const { adapter, type, key } = this.getTradingAdapter(symbol, preferredAdapter);

            if (type === 'broker') {
                // Use BrokerAdapter interface
                await adapter.closePosition(symbol);
                console.log(`✅ Position closed: ${percentage}% of ${symbol} via ${key}`);
                return { success: true, symbol, percentage };
            } else {
                // Use CCXT exchange interface
                const positions = await adapter.fetchPositions([symbol]);
                if (!positions || positions.length === 0) {
                    return { success: false, reason: 'No open position found' };
                }

                const position = positions[0];
                const closeAmount = position.contracts * (percentage / 100);
                const side = position.side === 'long' ? 'sell' : 'buy';

                const order = await adapter.createOrder(
                    symbol,
                    'market',
                    side,
                    closeAmount
                );

                console.log(`✅ Position closed: ${percentage}% of ${symbol} via ${key}`);
                return {
                    success: true,
                    orderId: order.id,
                    symbol,
                    amount: closeAmount,
                    side
                };
            }
        } catch (error) {
            console.error('Error closing position:', error);
            return { success: false, reason: error.message };
        }
    }

    /**
     * Get list of available brokers and exchanges
     */
    getAvailableAdapters() {
        return {
            brokers: Object.keys(this.brokers).map(key => ({
                key,
                info: this.brokers[key].getBrokerInfo(),
                authenticated: this.brokers[key].isAuthenticated
            })),
            exchanges: Object.keys(this.exchanges).map(key => ({
                key,
                name: key,
                type: 'crypto'
            })),
            factoryBrokers: BrokerFactory.getStats()
        };
    }
}

module.exports = TradeExecutor;
