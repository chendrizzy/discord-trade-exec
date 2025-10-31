/**
 * Denial Message Builder - Unit Tests
 *
 * Feature: 004-subscription-gating
 * Phase: 5 (User Story 3 - Non-Subscriber Attempts)
 * Task: T044 - Test denial message embed template
 *
 * Purpose: Test Discord embed generation for access denial messages
 *
 * Coverage:
 * - Embed structure and formatting
 * - Different denial reasons (no_subscription, subscription_expired, verification_failed)
 * - Required roles display
 * - Call-to-action messaging
 * - Error handling for invalid inputs
 */

const { EmbedBuilder } = require('discord.js');
const { buildDenialEmbed, getDenialReasonMessage, formatRolesList } = require('@utils/denial-message.builder');

describe('Denial Message Builder (Phase 5 - T044)', () => {
  describe('buildDenialEmbed()', () => {
    it('should create embed for no_subscription denial', () => {
      const embed = buildDenialEmbed({
        denialReason: 'no_subscription',
        requiredRoleIds: ['1111111111111111111', '2222222222222222222'],
        commandAttempted: '/trade'
      });

      expect(embed).toBeInstanceOf(EmbedBuilder);
      const embedData = embed.toJSON();

      expect(embedData.title).toBe('🔒 Access Denied');
      expect(embedData.description).toContain('subscription');
      expect(embedData.description).toContain('/trade');
      expect(embedData.color).toBe(0xED4245); // Discord red
      expect(embedData.fields).toBeDefined();
      expect(embedData.fields.length).toBeGreaterThan(0);
    });

    it('should create embed for subscription_expired denial', () => {
      const embed = buildDenialEmbed({
        denialReason: 'subscription_expired',
        requiredRoleIds: ['1111111111111111111'],
        commandAttempted: '/execute'
      });

      const embedData = embed.toJSON();

      expect(embedData.title).toBe('🔒 Access Denied');
      expect(embedData.description).toContain('expired');
      expect(embedData.description).toContain('/execute');
      expect(embedData.color).toBe(0xED4245);
    });

    it('should create embed for verification_failed denial', () => {
      const embed = buildDenialEmbed({
        denialReason: 'verification_failed',
        requiredRoleIds: ['1111111111111111111'],
        commandAttempted: '/status'
      });

      const embedData = embed.toJSON();

      expect(embedData.title).toBe('🔒 Access Denied');
      expect(embedData.description).toContain('verify');
      expect(embedData.description).toContain('/status');
      expect(embedData.color).toBe(0xED4245);
    });

    it('should include required roles field when roles provided', () => {
      const embed = buildDenialEmbed({
        denialReason: 'no_subscription',
        requiredRoleIds: ['1111111111111111111', '2222222222222222222'],
        commandAttempted: '/trade'
      });

      const embedData = embed.toJSON();
      const rolesField = embedData.fields.find(f => f.name.includes('Required'));

      expect(rolesField).toBeDefined();
      expect(rolesField.value).toContain('<@&1111111111111111111>');
      expect(rolesField.value).toContain('<@&2222222222222222222>');
    });

    it('should omit roles field when no roles provided', () => {
      const embed = buildDenialEmbed({
        denialReason: 'no_subscription',
        requiredRoleIds: [],
        commandAttempted: '/trade'
      });

      const embedData = embed.toJSON();
      const rolesField = embedData.fields.find(f => f.name.includes('Required'));

      expect(rolesField).toBeUndefined();
    });

    it('should include subscription call-to-action', () => {
      const embed = buildDenialEmbed({
        denialReason: 'no_subscription',
        requiredRoleIds: ['1111111111111111111'],
        commandAttempted: '/trade'
      });

      const embedData = embed.toJSON();
      const ctaField = embedData.fields.find(f => f.name.includes('Subscribe') || f.name.includes('Get Access'));

      expect(ctaField).toBeDefined();
      expect(ctaField.value).toContain('server administrator');
    });

    it('should include footer with support information', () => {
      const embed = buildDenialEmbed({
        denialReason: 'no_subscription',
        requiredRoleIds: ['1111111111111111111'],
        commandAttempted: '/trade'
      });

      const embedData = embed.toJSON();

      expect(embedData.footer).toBeDefined();
      expect(embedData.footer.text).toContain('Subscription');
    });

    it('should include timestamp', () => {
      const embed = buildDenialEmbed({
        denialReason: 'no_subscription',
        requiredRoleIds: ['1111111111111111111'],
        commandAttempted: '/trade'
      });

      const embedData = embed.toJSON();

      expect(embedData.timestamp).toBeDefined();
    });

    it('should handle invalid denial reason gracefully', () => {
      const embed = buildDenialEmbed({
        denialReason: 'invalid_reason',
        requiredRoleIds: ['1111111111111111111'],
        commandAttempted: '/trade'
      });

      const embedData = embed.toJSON();

      expect(embedData.title).toBe('🔒 Access Denied');
      expect(embedData.description).toContain('access'); // Generic message
    });

    it('should handle missing commandAttempted gracefully', () => {
      const embed = buildDenialEmbed({
        denialReason: 'no_subscription',
        requiredRoleIds: ['1111111111111111111'],
        commandAttempted: undefined
      });

      const embedData = embed.toJSON();

      expect(embedData.description).not.toContain('undefined');
    });
  });

  describe('getDenialReasonMessage()', () => {
    it('should return no_subscription message', () => {
      const message = getDenialReasonMessage('no_subscription', '/trade');

      expect(message).toContain('subscription');
      expect(message).toContain('/trade');
    });

    it('should return subscription_expired message', () => {
      const message = getDenialReasonMessage('subscription_expired', '/execute');

      expect(message).toContain('expired');
      expect(message).toContain('/execute');
    });

    it('should return verification_failed message', () => {
      const message = getDenialReasonMessage('verification_failed', '/status');

      expect(message).toContain('verify');
      expect(message).toContain('/status');
    });

    it('should return generic message for unknown reason', () => {
      const message = getDenialReasonMessage('unknown_reason', '/test');

      expect(message).toContain('access');
    });
  });

  describe('formatRolesList()', () => {
    it('should format single role as Discord mention', () => {
      const formatted = formatRolesList(['1111111111111111111']);

      expect(formatted).toBe('<@&1111111111111111111>');
    });

    it('should format multiple roles as Discord mentions', () => {
      const formatted = formatRolesList(['1111111111111111111', '2222222222222222222']);

      expect(formatted).toContain('<@&1111111111111111111>');
      expect(formatted).toContain('<@&2222222222222222222>');
    });

    it('should handle empty role array', () => {
      const formatted = formatRolesList([]);

      expect(formatted).toBe('Contact server administrator');
    });

    it('should handle null/undefined gracefully', () => {
      const formattedNull = formatRolesList(null);
      const formattedUndefined = formatRolesList(undefined);

      expect(formattedNull).toBe('Contact server administrator');
      expect(formattedUndefined).toBe('Contact server administrator');
    });
  });
});
