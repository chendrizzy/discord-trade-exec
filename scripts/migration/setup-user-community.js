/**
 * Migration Script: Setup Community for Testing User
 *
 * Creates a Community document for the Discord server and assigns
 * the user account to it, enabling broker credential encryption.
 *
 * Usage: node scripts/migration/setup-user-community.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Community = require('../../src/models/Community');
const User = require('../../src/models/User');

// Configuration
const DISCORD_GUILD_ID = '1141536344825413683';
const DISCORD_USER_ID = '298464600439914496';
const COMMUNITY_NAME = 'Discord Trade Executor - Test Server';

async function setupUserCommunity() {
  try {
    console.log('🔄 Starting community setup migration...\n');

    // Connect to MongoDB
    console.log('📊 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Step 1: Check if community already exists
    console.log('🔍 Checking for existing community...');
    let community = await Community.findOne({ discordGuildId: DISCORD_GUILD_ID });

    if (community) {
      console.log('✅ Community already exists:');
      console.log(`   ID: ${community._id}`);
      console.log(`   Name: ${community.name}`);
      console.log(`   Discord Guild: ${community.discordGuildId}\n`);
    } else {
      console.log('❌ Community not found. Creating new community...\n');
    }

    // Step 2: Find the user
    console.log('🔍 Finding user by Discord ID...');
    const user = await User.findOne({ discordId: DISCORD_USER_ID });

    if (!user) {
      console.error(`❌ ERROR: User with Discord ID ${DISCORD_USER_ID} not found!`);
      console.error('   Make sure you have logged in via Discord OAuth at least once.');
      process.exit(1);
    }

    console.log('✅ User found:');
    console.log(`   ID: ${user._id}`);
    console.log(`   Discord: ${user.discordTag || user.discordUsername}`);
    console.log(`   Email: ${user.email || 'N/A'}`);
    console.log(`   Current communityId: ${user.communityId || 'null'}\n`);

    // Step 3: Create or update community
    if (!community) {
      console.log('🏗️  Creating new community...');
      community = new Community({
        name: COMMUNITY_NAME,
        discordGuildId: DISCORD_GUILD_ID,
        admins: [
          {
            userId: user._id,
            role: 'owner',
            permissions: [
              'manage_signals',
              'manage_users',
              'manage_settings',
              'view_analytics',
              'execute_trades',
              'manage_billing'
            ],
            addedAt: new Date()
          }
        ],
        subscription: {
          tier: 'pro', // Grant pro tier for testing
          status: 'trial',
          trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30-day trial
        },
        settings: {
          autoExecute: false,
          defaultRiskProfile: 'moderate',
          allowedAssetClasses: ['stocks', 'crypto']
        }
      });

      await community.save();
      console.log('✅ Community created successfully!\n');
    } else if (!community.admins.some(admin => admin.userId.toString() === user._id.toString())) {
      // User not in admins, add them as owner
      console.log('⚠️  User not in admins. Adding as owner...');

      // Check if there's already an owner
      const hasOwner = community.admins.some(admin => admin.role === 'owner');

      if (hasOwner) {
        console.log('⚠️  Community already has an owner. Adding user as admin instead...');
        community.admins.push({
          userId: user._id,
          role: 'admin',
          permissions: [
            'manage_signals',
            'execute_trades',
            'view_analytics'
          ],
          addedAt: new Date()
        });
      } else {
        console.log('Adding user as owner...');
        community.admins.push({
          userId: user._id,
          role: 'owner',
          permissions: [
            'manage_signals',
            'manage_users',
            'manage_settings',
            'view_analytics',
            'execute_trades',
            'manage_billing'
          ],
          addedAt: new Date()
        });
      }

      await community.save();
      console.log('✅ User added to community admins\n');
    }

    // Step 4: Assign community to user
    if (!user.communityId || user.communityId.toString() !== community._id.toString()) {
      console.log('🔗 Linking user to community...');
      user.communityId = community._id;
      await user.save();
      console.log('✅ User linked to community\n');
    } else {
      console.log('✅ User already linked to this community\n');
    }

    // Step 5: Verify setup
    console.log('🔍 Verifying setup...\n');

    const verifiedUser = await User.findById(user._id).populate('communityId');
    const verifiedCommunity = await Community.findById(community._id);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ SETUP COMPLETE - VERIFICATION SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('👤 USER DETAILS:');
    console.log(`   MongoDB ID: ${verifiedUser._id}`);
    console.log(`   Discord ID: ${verifiedUser.discordId}`);
    console.log(`   Username: ${verifiedUser.discordTag || verifiedUser.discordUsername}`);
    console.log(`   Community ID: ${verifiedUser.communityId ? verifiedUser.communityId._id : 'null'}`);
    console.log(`   Community Name: ${verifiedUser.communityId ? verifiedUser.communityId.name : 'N/A'}\n`);

    console.log('🏢 COMMUNITY DETAILS:');
    console.log(`   MongoDB ID: ${verifiedCommunity._id}`);
    console.log(`   Name: ${verifiedCommunity.name}`);
    console.log(`   Discord Guild ID: ${verifiedCommunity.discordGuildId}`);
    console.log(`   Subscription Tier: ${verifiedCommunity.subscription.tier}`);
    console.log(`   Subscription Status: ${verifiedCommunity.subscription.status}`);
    console.log(`   Trial Ends: ${verifiedCommunity.subscription.trialEndsAt.toLocaleDateString()}`);
    console.log(`   Admins: ${verifiedCommunity.admins.length}`);

    const userAdmin = verifiedCommunity.admins.find(
      admin => admin.userId.toString() === verifiedUser._id.toString()
    );
    if (userAdmin) {
      console.log(`   Your Role: ${userAdmin.role}`);
      console.log(`   Your Permissions: ${userAdmin.permissions.join(', ')}\n`);
    }

    console.log('🔐 BROKER CONFIGURATION STATUS:');
    if (verifiedUser.communityId) {
      console.log('   ✅ Ready to configure brokers!');
      console.log('   ✅ AWS KMS encryption will use communityId as context');
      console.log(`   ✅ Encryption context: ${verifiedUser.communityId._id}\n`);
    } else {
      console.log('   ❌ ERROR: User still has no communityId!\n');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎯 NEXT STEPS:');
    console.log('   1. Try configuring Alpaca broker in the dashboard');
    console.log('   2. The 400 error should now be resolved');
    console.log('   3. Credentials will be encrypted with your communityId');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run migration
setupUserCommunity();
