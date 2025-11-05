const logger = require('../../utils/logger');

/**
 * Standardized error handler for broker adapter operations
 *
 * Provides consistent error logging and error wrapping across all broker adapters.
 * Reduces code duplication by centralizing the error handling pattern.
 *
 * @param {Object} adapter - The broker adapter instance
 * @param {string} operation - Description of the operation that failed (e.g., "create order", "fetch balance")
 * @param {Error} error - The original error object
 * @param {Object} context - Additional context to include in logs (e.g., {symbol, orderId, quantity})
 * @throws {Error} Wrapped error with standardized message format
 *
 * @example
 * try {
 *   const result = await this.exchange.createOrder(symbol, type, side, quantity, price);
 *   return result;
 * } catch (error) {
 *   handleBrokerError(this, 'create order', error, { symbol, side, type, quantity });
 * }
 */
function handleBrokerError(adapter, operation, error, context = {}) {
  // Log detailed error information with broker-specific prefix
  logger.error(`[${adapter.brokerName}Adapter] ${operation} failed`, {
    error: error.message,
    stack: error.stack,
    ...context
  });

  // Capitalize broker name for error message (binance -> Binance)
  const brokerNameCapitalized = adapter.brokerName.charAt(0).toUpperCase() + adapter.brokerName.slice(1);

  // Replace {broker} placeholder in operation string (e.g., "place {broker} order" -> "place Binance order")
  // Also handle "connect" special case to add "to" preposition
  let operationStr = operation.replace('{broker}', brokerNameCapitalized);
  if (operation === 'connect') {
    operationStr = `connect to ${brokerNameCapitalized}`;
  } else if (!operation.includes('{broker}')) {
    // If no placeholder, append broker name at the end
    operationStr = `${operation} ${brokerNameCapitalized}`;
  }

  // Throw standardized error message
  throw new Error(`Failed to ${operationStr}: ${error.message}`);
}

module.exports = { handleBrokerError };
