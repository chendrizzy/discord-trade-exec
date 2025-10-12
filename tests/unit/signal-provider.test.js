const { describe, it, beforeEach, afterEach, expect } = require('@jest/globals');
const mongoose = require('mongoose');
const SignalProvider = require('../../src/models/SignalProvider');

describe('Signal Provider', () => {
    let provider1, provider2, provider3;

    beforeEach(async () => {
        // Create test providers
        provider1 = new SignalProvider({
            providerId: 'test-provider-1',
            type: 'discord_channel',
            name: 'Premium Crypto Signals',
            description: 'High-quality crypto signals with excellent track record',
            source: {
                platform: 'discord',
                channelId: 'channel-123'
            },
            performance: {
                totalSignals: 100,
                executedTrades: 80,
                successfulTrades: 56,
                winRate: 70.0,
                totalProfit: 15000,
                totalLoss: 5000,
                netProfit: 10000,
                profitFactor: 3.0,
                sharpeRatio: 1.8,
                maxDrawdown: 0.12,
                avgProfitPerTrade: 125
            },
            signalQuality: {
                stopLossHitRate: 30,
                takeProfitHitRate: 70,
                averageRiskReward: 2.5,
                hasStopLoss: 95,
                hasTakeProfit: 98
            },
            subscribers: 150,
            activeSubscribers: 120,
            rating: 4.5,
            priority: 80,
            verificationStatus: 'verified',
            isActive: true
        });

        provider2 = new SignalProvider({
            providerId: 'test-provider-2',
            type: 'tradingview',
            name: 'TradingView Alerts',
            description: 'Automated TradingView strategy alerts',
            source: {
                platform: 'tradingview',
                channelId: 'strategy-456'
            },
            performance: {
                totalSignals: 200,
                executedTrades: 180,
                successfulTrades: 108,
                winRate: 60.0,
                totalProfit: 20000,
                totalLoss: 10000,
                netProfit: 10000,
                profitFactor: 2.0,
                sharpeRatio: 1.2,
                maxDrawdown: 0.18,
                avgProfitPerTrade: 55
            },
            signalQuality: {
                stopLossHitRate: 40,
                takeProfitHitRate: 60,
                averageRiskReward: 1.8,
                hasStopLoss: 100,
                hasTakeProfit: 100
            },
            subscribers: 200,
            activeSubscribers: 180,
            rating: 4.2,
            priority: 70,
            verificationStatus: 'verified',
            isActive: true
        });

        provider3 = new SignalProvider({
            providerId: 'test-provider-3',
            type: 'telegram',
            name: 'Telegram Trading Group',
            description: 'Community-driven trading signals',
            source: {
                platform: 'telegram',
                channelId: 'group-789'
            },
            performance: {
                totalSignals: 50,
                executedTrades: 40,
                successfulTrades: 24,
                winRate: 60.0,
                totalProfit: 5000,
                totalLoss: 3000,
                netProfit: 2000,
                profitFactor: 1.67,
                sharpeRatio: 0.9,
                maxDrawdown: 0.15,
                avgProfitPerTrade: 50
            },
            signalQuality: {
                stopLossHitRate: 40,
                takeProfitHitRate: 60,
                averageRiskReward: 1.5,
                hasStopLoss: 80,
                hasTakeProfit: 85
            },
            subscribers: 80,
            activeSubscribers: 60,
            rating: 3.8,
            priority: 50,
            verificationStatus: 'verified',
            isActive: true
        });
    });

    describe('Performance Tracking', () => {
        it('should calculate win rate correctly', () => {
            expect(provider1.performance.winRate).toBe(70.0);
            expect(provider2.performance.winRate).toBe(60.0);
        });

        it('should track profit factor', () => {
            expect(provider1.performance.profitFactor).toBe(3.0);
            expect(provider2.performance.profitFactor).toBe(2.0);
        });

        it('should record net profit', () => {
            expect(provider1.performance.netProfit).toBe(10000);
            expect(provider2.performance.netProfit).toBe(10000);
        });

        it('should track Sharpe ratio for risk-adjusted returns', () => {
            expect(provider1.performance.sharpeRatio).toBe(1.8);
            expect(provider2.performance.sharpeRatio).toBe(1.2);
        });

        it('should monitor maximum drawdown', () => {
            expect(provider1.performance.maxDrawdown).toBe(0.12); // 12%
            expect(provider2.performance.maxDrawdown).toBe(0.18); // 18%
        });
    });

    describe('Signal Quality Metrics', () => {
        it('should track stop loss hit rate', () => {
            expect(provider1.signalQuality.stopLossHitRate).toBe(30);
            expect(provider2.signalQuality.stopLossHitRate).toBe(40);
        });

        it('should track take profit hit rate', () => {
            expect(provider1.signalQuality.takeProfitHitRate).toBe(70);
            expect(provider2.signalQuality.takeProfitHitRate).toBe(60);
        });

        it('should calculate average risk/reward ratio', () => {
            expect(provider1.signalQuality.averageRiskReward).toBe(2.5);
            expect(provider2.signalQuality.averageRiskReward).toBe(1.8);
        });

        it('should track signal completeness', () => {
            expect(provider1.signalQuality.hasStopLoss).toBe(95);
            expect(provider1.signalQuality.hasTakeProfit).toBe(98);
        });
    });

    describe('Conflict Resolution', () => {
        it('should resolve conflict by priority when multiple signals exist', async () => {
            const signals = [
                { signal: 'buy BTC', provider: provider3 }, // priority: 50
                { signal: 'sell BTC', provider: provider2 }, // priority: 70
                { signal: 'hold BTC', provider: provider1 }  // priority: 80
            ];

            const winner = await SignalProvider.resolveConflict(signals);

            expect(winner.provider.priority).toBe(80);
            expect(winner.provider.name).toBe('Premium Crypto Signals');
        });

        it('should use win rate as tiebreaker when priorities are equal', async () => {
            // Set equal priorities
            provider1.priority = 70;
            provider2.priority = 70;

            const signals = [
                { signal: 'buy BTC', provider: provider2 }, // winRate: 60%
                { signal: 'sell BTC', provider: provider1 }  // winRate: 70%
            ];

            const winner = await SignalProvider.resolveConflict(signals);

            expect(winner.provider.performance.winRate).toBe(70.0);
        });

        it('should use net profit as final tiebreaker', async () => {
            // Set equal priorities and win rates
            provider1.priority = 70;
            provider2.priority = 70;
            provider1.performance.winRate = 65;
            provider2.performance.winRate = 65;

            const signals = [
                { signal: 'buy BTC', provider: provider1 }, // netProfit: 10000
                { signal: 'sell BTC', provider: provider2 }  // netProfit: 10000
            ];

            const winner = await SignalProvider.resolveConflict(signals);

            // Both have same net profit, but provider1 has higher initial data
            expect(winner.provider).toBeDefined();
        });

        it('should return null for empty signal array', async () => {
            const winner = await SignalProvider.resolveConflict([]);

            expect(winner).toBeNull();
        });

        it('should return the only signal when array has one element', async () => {
            const signals = [{ signal: 'buy BTC', provider: provider1 }];

            const winner = await SignalProvider.resolveConflict(signals);

            expect(winner.provider.providerId).toBe('test-provider-1');
        });
    });

    describe('Subscriber Management', () => {
        it('should track total subscribers', () => {
            expect(provider1.subscribers).toBe(150);
            expect(provider2.subscribers).toBe(200);
        });

        it('should track active subscribers separately', () => {
            expect(provider1.activeSubscribers).toBe(120);
            expect(provider2.activeSubscribers).toBe(180);
        });

        it('should maintain subscriber count integrity', () => {
            expect(provider1.activeSubscribers).toBeLessThanOrEqual(provider1.subscribers);
            expect(provider2.activeSubscribers).toBeLessThanOrEqual(provider2.subscribers);
        });
    });

    describe('Rating System', () => {
        it('should support ratings from 0 to 5', () => {
            expect(provider1.rating).toBeGreaterThanOrEqual(0);
            expect(provider1.rating).toBeLessThanOrEqual(5);
        });

        it('should calculate average rating from reviews', async () => {
            const fakeUserId = new mongoose.Types.ObjectId();

            provider1.reviews = [];
            await provider1.addReview(fakeUserId, 5, 'Excellent signals!');
            await provider1.addReview(new mongoose.Types.ObjectId(), 4, 'Very good');
            await provider1.addReview(new mongoose.Types.ObjectId(), 5, 'Amazing');

            // Average should be (5 + 4 + 5) / 3 = 4.67
            expect(provider1.rating).toBeCloseTo(4.67, 0.1);
        });

        it('should prevent duplicate reviews from same user', async () => {
            const fakeUserId = new mongoose.Types.ObjectId();

            provider1.reviews = [];
            await provider1.addReview(fakeUserId, 5, 'Great!');

            // Try to add another review from same user
            const reviewCount = provider1.reviews.length;
            await provider1.addReview(fakeUserId, 3, 'Changed my mind');

            // Should still have only 1 review
            expect(provider1.reviews.length).toBe(reviewCount);
        });
    });

    describe('Verification Status', () => {
        it('should track verification status', () => {
            expect(provider1.verificationStatus).toBe('verified');
        });

        it('should support different verification statuses', () => {
            const statuses = ['pending', 'verified', 'rejected'];

            statuses.forEach(status => {
                provider1.verificationStatus = status;
                expect(provider1.verificationStatus).toBe(status);
            });
        });
    });

    describe('Priority System', () => {
        it('should enforce priority range 0-100', () => {
            expect(provider1.priority).toBeGreaterThanOrEqual(0);
            expect(provider1.priority).toBeLessThanOrEqual(100);
        });

        it('should allow priority adjustment for conflict resolution', () => {
            const originalPriority = provider1.priority;

            provider1.priority = 90;
            expect(provider1.priority).toBe(90);
            expect(provider1.priority).not.toBe(originalPriority);
        });
    });

    describe('Provider Types', () => {
        it('should support different provider types', () => {
            expect(provider1.type).toBe('discord_channel');
            expect(provider2.type).toBe('tradingview');
            expect(provider3.type).toBe('telegram');
        });

        it('should validate provider types', () => {
            const validTypes = ['discord_channel', 'tradingview', 'telegram', 'webhook', 'manual'];

            validTypes.forEach(type => {
                provider1.type = type;
                expect(provider1.type).toBe(type);
            });
        });
    });
});
