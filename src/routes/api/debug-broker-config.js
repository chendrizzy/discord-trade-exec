/**
 * Debug Broker Configuration Endpoint
 * Temporary endpoint to diagnose broker config storage issues
 * DELETE THIS FILE after debugging is complete
 */

const express = require('express');
const router = express.Router();
const User = require('../../models/User');

router.get('/debug-broker-config', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

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
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
