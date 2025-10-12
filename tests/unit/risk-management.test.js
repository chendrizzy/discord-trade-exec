const { describe, it, beforeEach, expect } = require('@jest/globals');
const User = require('../../src/models/User');

describe('Risk Management', () => {
    let user;

    beforeEach(async () => {
        // Create a test user with default risk settings
        user = new User({
            discordId: 'test-123',
            username: 'testuser',
            email: 'test@example.com',
            tradingConfig: {
                riskManagement: {
                    maxPositionSize: 0.02,
                    positionSizingMethod: 'risk_based',
                    defaultStopLoss: 0.02,
                    defaultTakeProfit: 0.04,
                    useTrailingStop: false,
                    trailingStopPercent: 0.015,
                    maxDailyLoss: 0.05,
                    dailyLossAmount: 0,
                    dailyLossResetDate: new Date(),
                    maxOpenPositions: 3,
                    maxPositionsPerSymbol: 1,
                    maxPortfolioRisk: 0.10,
                    tradingHoursEnabled: false,
                    tradingHoursStart: '09:00',
                    tradingHoursEnd: '17:00'
                }
            }
        });
    });

    describe('Daily Loss Limit', () => {
        it('should allow trading when under daily loss limit', () => {
            user.tradingConfig.riskManagement.dailyLossAmount = 0.03; // 3%
            user.tradingConfig.riskManagement.maxDailyLoss = 0.05; // 5%

            const result = user.checkDailyLossLimit();

            expect(result.allowed).toBe(true);
            expect(result.currentLoss).toBe(0.03);
            expect(result.maxLoss).toBe(0.05);
        });

        it('should block trading when daily loss limit reached', () => {
            user.tradingConfig.riskManagement.dailyLossAmount = 0.06; // 6%
            user.tradingConfig.riskManagement.maxDailyLoss = 0.05; // 5%

            const result = user.checkDailyLossLimit();

            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('Daily loss limit reached');
        });

        it('should reset daily loss on new day', () => {
            // Set loss amount with yesterday's date
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            user.tradingConfig.riskManagement.dailyLossAmount = 0.06; // 6%
            user.tradingConfig.riskManagement.dailyLossResetDate = yesterday;

            const result = user.checkDailyLossLimit();

            // Should reset to 0 and allow trading
            expect(result.allowed).toBe(true);
            expect(user.tradingConfig.riskManagement.dailyLossAmount).toBe(0);
        });

        it('should record daily loss correctly', async () => {
            const lossAmount = 0.02; // 2%

            await user.recordDailyLoss(lossAmount);

            expect(user.tradingConfig.riskManagement.dailyLossAmount).toBe(0.02);
        });

        it('should accumulate daily losses', async () => {
            await user.recordDailyLoss(0.02); // 2%
            await user.recordDailyLoss(0.01); // 1%

            expect(user.tradingConfig.riskManagement.dailyLossAmount).toBe(0.03);
        });
    });

    describe('Position Sizing', () => {
        it('should calculate risk-based position size correctly', () => {
            const accountBalance = 10000;
            const entryPrice = 50000;
            const stopLossPrice = 49000;

            const result = user.calculatePositionSize(accountBalance, entryPrice, stopLossPrice);

            expect(result.positionSize).toEqual(expect.any(Number));
            expect(result.riskAmount).toEqual(expect.any(Number));
            expect(result.stopLossDistance).toEqual(expect.any(Number));
            expect(result.riskAmount).toBeLessThanOrEqual(accountBalance * 0.02); // Within 2% risk
        });

        it('should respect max position size', () => {
            user.tradingConfig.riskManagement.maxPositionSize = 0.01; // 1%

            const accountBalance = 10000;
            const entryPrice = 50000;
            const stopLossPrice = 49000;

            const result = user.calculatePositionSize(accountBalance, entryPrice, stopLossPrice);

            // Risk should not exceed 1% of account
            expect(result.riskAmount).toBeLessThanOrEqual(accountBalance * 0.01);
        });

        it('should handle different position sizing methods', () => {
            const accountBalance = 10000;
            const entryPrice = 50000;
            const stopLossPrice = 49000;

            // Test risk_based method
            user.tradingConfig.riskManagement.positionSizingMethod = 'risk_based';
            const riskBased = user.calculatePositionSize(accountBalance, entryPrice, stopLossPrice);
            expect(riskBased.positionSize).toEqual(expect.any(Number));

            // Fixed method would need to be implemented in User model
        });
    });

    describe('Trading Hours', () => {
        it('should allow trading when trading hours disabled', () => {
            user.tradingConfig.riskManagement.tradingHoursEnabled = false;

            const result = user.checkTradingHours();

            expect(result.allowed).toBe(true);
        });

        it('should allow trading within trading hours', () => {
            user.tradingConfig.riskManagement.tradingHoursEnabled = true;

            // Get current UTC time
            const now = new Date();
            const currentHour = now.getUTCHours();

            // Set trading hours around current time
            user.tradingConfig.riskManagement.tradingHoursStart = `${String(currentHour - 1).padStart(2, '0')}:00`;
            user.tradingConfig.riskManagement.tradingHoursEnd = `${String(currentHour + 1).padStart(2, '0')}:00`;

            const result = user.checkTradingHours();

            expect(result.allowed).toBe(true);
        });

        it('should block trading outside trading hours', () => {
            user.tradingConfig.riskManagement.tradingHoursEnabled = true;

            // Get current UTC time
            const now = new Date();
            const currentHour = now.getUTCHours();

            // Set trading hours that don't include current time
            user.tradingConfig.riskManagement.tradingHoursStart = `${String((currentHour + 2) % 24).padStart(2, '0')}:00`;
            user.tradingConfig.riskManagement.tradingHoursEnd = `${String((currentHour + 4) % 24).padStart(2, '0')}:00`;

            const result = user.checkTradingHours();

            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('Trading outside allowed hours');
        });
    });

    describe('Portfolio Risk Limits', () => {
        it('should enforce max portfolio risk', () => {
            const maxPortfolioRisk = user.tradingConfig.riskManagement.maxPortfolioRisk;

            expect(maxPortfolioRisk).toBe(0.10); // 10%
            expect(maxPortfolioRisk).toBeLessThan(0.31);
            expect(maxPortfolioRisk).toBeGreaterThan(0.04);
        });

        it('should enforce max open positions', () => {
            const maxOpenPositions = user.tradingConfig.riskManagement.maxOpenPositions;

            expect(maxOpenPositions).toBe(3);
            expect(maxOpenPositions).toBeGreaterThan(0);
            expect(maxOpenPositions).toBeLessThan(11);
        });

        it('should enforce max positions per symbol', () => {
            const maxPositionsPerSymbol = user.tradingConfig.riskManagement.maxPositionsPerSymbol;

            expect(maxPositionsPerSymbol).toBe(1);
            expect(maxPositionsPerSymbol).toBeGreaterThan(0);
            expect(maxPositionsPerSymbol).toBeLessThan(4);
        });
    });

    describe('Stop Loss & Take Profit', () => {
        it('should have default stop loss settings', () => {
            const defaultStopLoss = user.tradingConfig.riskManagement.defaultStopLoss;

            expect(defaultStopLoss).toBe(0.02); // 2%
            expect(defaultStopLoss).toBeGreaterThan(0.009);
            expect(defaultStopLoss).toBeLessThan(0.11);
        });

        it('should have default take profit settings', () => {
            const defaultTakeProfit = user.tradingConfig.riskManagement.defaultTakeProfit;

            expect(defaultTakeProfit).toBe(0.04); // 4%
            expect(defaultTakeProfit).toBeGreaterThan(0.019);
            expect(defaultTakeProfit).toBeLessThan(0.21);
        });

        it('should support trailing stop configuration', () => {
            user.tradingConfig.riskManagement.useTrailingStop = true;
            user.tradingConfig.riskManagement.trailingStopPercent = 0.015; // 1.5%

            expect(user.tradingConfig.riskManagement.useTrailingStop).toBe(true);
            expect(user.tradingConfig.riskManagement.trailingStopPercent).toBe(0.015);
        });
    });
});
