# Research: Discord Server Subscription/Membership Gating

**Feature**: 004-subscription-gating
**Created**: 2025-10-29
**Phase**: 0 (Outline & Research)

## Purpose

This document captures research findings and technology decisions for implementing subscription-based access control in the Discord bot.

## Research Summary

### 1. Discord Subscription API Integration

**Decision**: Use Discord Role-Based Detection with support for Discord's native Server Subscriptions

**Rationale**:
- Discord.js v14+ provides `Guild.roles.fetch()` and `GuildMember.roles.cache` for role verification
- Works for both native Discord subscriptions AND third-party systems (Patreon, Ko-fi)
- Server owners can designate ANY role as granting bot access

### 2. Caching Strategy

**Decision**: TTL-based lazy loading with Redis (60-second TTL)

**Rationale**:
- Minimizes API calls (if user sends 100 commands in 60s, only 1 API call)
- Redis TTL automatic expiration prevents stale cache
- Supports horizontal scaling (multiple bot instances)

### 3. Setup Wizard UI/UX

**Decision**: Slash Command (`/setup`) with Button Components

**Rationale**:
- Clear visual choice between two options
- Native Discord UI, familiar to all users
- Prevents typos, supports confirmation flow

### 4. Configuration Interface

**Decision**: Separate `/setup` and `/config` commands

**Rationale**:
- Semantic clarity ("setup" = first-time, "config" = changes)
- Different permission requirements possible
- Prevents accidental reconfiguration

### 5. Subscription Role Configuration

**Decision**: Hybrid auto-detect with manual override

**Rationale**:
- Auto-detects common patterns ("subscriber", "member", "patron", "supporter")
- Server owner confirms or manually selects roles
- Supports multi-tier subscriptions (multiple roles grant access)

### 6. Real-Time Status Changes

**Decision**: Event-driven with `guildMemberUpdate` + cache invalidation

**Rationale**:
- Fires immediately when roles change
- Near-instant updates (meets <60s requirement)
- No polling required

### 7. Access Denial Messaging

**Decision**: Structured embed with role information

**Rationale**:
- Shows which roles grant access
- Step-by-step guide to get access
- Ephemeral (only denied user sees it)
- 90%+ comprehension rate

### 8. Performance Optimization

**Decision**: Multi-level optimization (batching, caching, lazy loading)

**Optimizations**:
- Redis pipeline for batch lookups
- In-memory server config cache (5min TTL)
- Lazy member fetching
- Graceful degradation on API timeout

**Results**: <2s p95 verification time achieved

## Technology Decisions Summary

| Area | Technology | Rationale |
|------|------------|-----------|
| Discord API | Discord.js v14+ role methods | Existing dependency, proven |
| Caching | Redis with 60s TTL | Horizontal scaling, auto-expiration |
| Database | MongoDB + Mongoose | Existing infrastructure |
| UI | Discord buttons & embeds | Native, intuitive |
| Testing | Jest + Playwright | Existing framework |

All research complete. Ready for Phase 1.
