# Polymarket Intelligence - Phase 2 Architecture Overview

## Research-Driven Architecture Decisions

### Core Stack
- **Job Queue**: BullMQ with Redis (Score: 8.85/10)
- **Caching**: Optional Redis with in-memory fallback (Score: 8/10)
- **Whale Scoring**: Service orchestrates model methods (Score: 9/10)
- **Anomaly Timing**: Hybrid smart triggering (Score: 9.5/10)
- **Alert Dedup**: Redis-first with DB audit (Score: 9/10)

### Performance Targets (Per-Analyzer)
- **WhaleDetector**: <500ms per wallet update
- **SentimentAnalyzer**: <2s per market analysis
- **AnomalyDetector**: <1s real-time, <30s batched
- **AnalysisPipeline**: <5s total processing time ✅

## Component Summary

### 1. WhaleDetector (`src/services/polymarket/WhaleDetector.js`)
Orchestrates hourly whale score updates using existing `PolymarketWallet.updateWhaleStatus()` method.

### 2. SentimentAnalyzer (`src/services/polymarket/SentimentAnalyzer.js`)
15-minute rolling window analysis with volume spike and sentiment shift detection.

### 3. CacheManager (`src/services/polymarket/CacheManager.js`)
Shared Redis wrapper matching `analytics-cache.js` pattern with graceful fallback.

### 4. AnomalyDetector (`src/services/polymarket/AnomalyDetector.js`)
Hybrid timing: real-time for critical (>$100K, whales) + batched (30s) for normal.

### 5. AnalysisPipeline (`src/services/polymarket/AnalysisPipeline.js`)
Main orchestrator coordinating all analyzers with BullMQ integration.

### 6. Discord Alert System
- `AlertFormatter.js` - Discord embed builder
- `DiscordAlertService.js` - Webhook delivery with deduplication

### 7. BullMQ Infrastructure (`src/config/bullmq.js`, `src/jobs/`)
4 queues: whale-updates, anomaly-batch, analysis, alerts

## Event Flow

```
EventListener → TransactionProcessor → AnalysisPipeline.processTransaction()
├─ WhaleDetector.updateWallet() [async, non-blocking] <500ms
├─ SentimentAnalyzer.analyzeMarket() [cached] <2s
└─ AnomalyDetector.checkTransaction() [hybrid] <1s
Total: <3.5s ✅
```

## Infrastructure Requirements
- **Redis**: Required for BullMQ + caching + dedup (shared)
- **Cost**: $15/mo managed Redis (free for single instance dev)
- **Migration**: 12-16 hours implementation

## Files to Create (7 services + infrastructure)
1. `src/services/polymarket/WhaleDetector.js`
2. `src/services/polymarket/SentimentAnalyzer.js`
3. `src/services/polymarket/CacheManager.js`
4. `src/services/polymarket/AnomalyDetector.js`
5. `src/services/polymarket/AnalysisPipeline.js`
6. `src/services/polymarket/AlertFormatter.js`
7. `src/services/polymarket/DiscordAlertService.js`
8. `src/config/bullmq.js`
9. `src/jobs/workers/*.js` (4 workers)
10. `src/jobs/index.js`
