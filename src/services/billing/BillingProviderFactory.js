/**
 * BillingProviderFactory
 *
 * Factory pattern for creating billing provider instances based on environment configuration.
 * Enables switching between Polar.sh and future billing providers without code changes.
 *
 * Configuration:
 * - Environment variable: BILLING_PROVIDER (defaults to 'polar')
 * - Supported values: 'polar'
 *
 * Usage:
 *   const provider = BillingProviderFactory.createProvider();
 *   const subscription = await provider.getSubscription(customerId);
 *
 * Benefits:
 * - Single point of configuration for billing provider
 * - Type-safe provider instantiation
 * - Clear error messages for unsupported providers
 * - Easy A/B testing between providers
 */

const PolarBillingProvider = require('./providers/PolarBillingProvider');
const logger = require('../../utils/logger');
class BillingProviderFactory {
  /**
   * Create billing provider instance based on environment configuration
   * @returns {BillingProvider} Configured billing provider instance
   * @throws {Error} If BILLING_PROVIDER is unsupported
   */
  static createProvider() {
    const providerType = (process.env.BILLING_PROVIDER || 'polar').toLowerCase();

    switch (providerType) {
      case 'polar':
        logger.info('[BillingProviderFactory] Creating Polar.sh billing provider');
        return new PolarBillingProvider();

      default:
        throw new Error(
          `Unsupported billing provider: "${providerType}". ` +
          `Supported providers: "polar". ` +
          `Set BILLING_PROVIDER environment variable to change provider.`
        );
    }
  }

  /**
   * Get current billing provider type from environment
   * @returns {string} Provider type ('polar')
   */
  static getProviderType() {
    const requested = (process.env.BILLING_PROVIDER || 'polar').toLowerCase();
    return this.isSupported(requested) ? requested : 'polar';
  }

  /**
   * Check if a billing provider type is supported
   * @param {string} providerType - Provider type to check
   * @returns {boolean} True if provider is supported
   */
  static isSupported(providerType) {
    const normalizedType = (providerType || '').toLowerCase();
    return ['polar'].includes(normalizedType);
  }

  /**
   * List all supported billing provider types
   * @returns {string[]} Array of supported provider names
   */
  static getSupportedProviders() {
    return ['polar'];
  }
}

module.exports = BillingProviderFactory;
