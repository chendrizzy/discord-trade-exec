/**
 * Debug Broker Configuration Endpoint
 * Temporary endpoint to diagnose broker config storage issues
 * DELETE THIS FILE after debugging is complete
 */

const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const { ensureAuthenticated } = require('../../middleware/auth');
const { AppError, ErrorCodes } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');

router.get('/debug-broker-config', ensureAuthenticated, async (req, res) => {
  try {

    const user = await User.findById(req.user.id).lean(); // Use lean() to get raw MongoDB document

    res.json({
      success: true,
      debug: {
        userId: user._id,
        hasBrokerConfigs: !!user.brokerConfigs,
        brokerConfigsType: typeof user.brokerConfigs,
        brokerConfigsConstructor: user.brokerConfigs?.constructor?.name,
        brokerConfigsValue: user.brokerConfigs,
        isMap: user.brokerConfigs instanceof Map,
        isObject: user.brokerConfigs !== null && typeof user.brokerConfigs === 'object' && !Array.isArray(user.brokerConfigs),
        keys: user.brokerConfigs ? Object.keys(user.brokerConfigs) : null,
        mongooseRawType: user.brokerConfigs?._bsontype
      }
    });
  } catch (error) {
    logger.error('Error fetching broker config debug info:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      correlationId: req.correlationId
    });
    throw new AppError(
      'Failed to fetch debug information',
      500,
      ErrorCodes.INTERNAL_SERVER_ERROR,
      { userId: req.user?.id }
    );
  }
});

module.exports = router;
