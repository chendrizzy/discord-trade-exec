const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./src/models/User');
const { getMFAService } = require('./src/services/MFAService');

async function test() {
  try {
    // Connect to test database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/trade-executor-test');

    // Create test user with backup codes
    const speakeasy = require('speakeasy');
    const secret = speakeasy.generateSecret({ length: 32 });
    const mfaService = getMFAService();
    const encryptedSecret = mfaService.encryptSecret(secret.base32);

    const hashedBackupCodes = [
      { code: await bcrypt.hash('BACKUP01', 10), used: false },
      { code: await bcrypt.hash('BACKUP02', 10), used: false },
      { code: await bcrypt.hash('BACKUP03', 10), used: true }
    ];

    const testUser = await User.create({
      discordId: 'test_backup_' + Date.now(),
      username: 'test_user',
      discordUsername: 'test_user',
      discordTag: 'test_user#1234',
      email: 'test@example.com',
      subscription: {
        status: 'active',
        tier: 'professional'
      },
      mfa: {
        enabled: true,
        secret: encryptedSecret,
        backupCodes: hashedBackupCodes
      }
    });

    console.log('Created user:', testUser._id);
    console.log('Backup codes count:', testUser.mfa.backupCodes.length);

    // Try to verify backup code
    try {
      const isValid = await mfaService.verifyBackupCode(testUser._id.toString(), 'BACKUP01');
      console.log('Verification result:', isValid);

      // Check if code was marked as used
      const updatedUser = await User.findById(testUser._id);
      console.log('Updated backup codes:', updatedUser.mfa.backupCodes.map(bc => ({ used: bc.used, usedAt: bc.usedAt })));
    } catch (error) {
      console.error('Verification error:', error.message);
      console.error('Stack:', error.stack);
    }

    // Cleanup
    await User.deleteOne({ _id: testUser._id });
    await mongoose.disconnect();
  } catch (error) {
    console.error('Test error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

test();
