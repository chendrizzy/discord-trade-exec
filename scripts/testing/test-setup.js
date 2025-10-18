require('dotenv').config();

// External dependencies
const { Client, GatewayIntentBits } = require('discord.js');
const mongoose = require('mongoose');

console.log('\n🔍 Testing Discord Trade Bot Setup...\n');

// Check environment variables
console.log('1️⃣ Environment Variables:');
console.log(
  '   DISCORD_BOT_TOKEN:',
  process.env.DISCORD_BOT_TOKEN
    ? process.env.DISCORD_BOT_TOKEN.startsWith('your_')
      ? '❌ PLACEHOLDER'
      : '✅ Set'
    : '❌ Missing'
);
console.log(
  '   MONGODB_URI:',
  process.env.MONGODB_URI
    ? process.env.MONGODB_URI.includes('localhost')
      ? '⚠️  Local (change to Atlas)'
      : '✅ Set'
    : '❌ Missing'
);

// Test Discord token
console.log('\n2️⃣ Testing Discord Connection...');
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.on('clientReady', () => {
  console.log('   ✅ Discord bot connected as:', client.user.tag);
  console.log('   ✅ Bot is in', client.guilds.cache.size, 'server(s)');
  client.destroy();
  testMongoDB();
});

client.on('error', error => {
  console.log('   ❌ Discord connection failed:', error.message);
  if (error.message.includes('TOKEN')) {
    console.log('\n   💡 Fix: Update DISCORD_BOT_TOKEN in .env file');
    console.log('   Format: MTxxxxxxxxxxx.xxxxxx.xxxxxxxxxxxxxxxxxx');
  }
  process.exit(1);
});

// Test MongoDB connection
async function testMongoDB() {
  console.log('\n3️⃣ Testing MongoDB Connection...');
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('   ✅ MongoDB connected successfully');
    console.log('   ✅ Database:', mongoose.connection.name);

    console.log('\n✅ All tests passed! Bot is ready to run.');
    console.log('\n🚀 Start the bot with: npm start');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.log('   ❌ MongoDB connection failed:', error.message);
    console.log('\n   💡 Fix: Update MONGODB_URI in .env file');
    console.log('   Format: mongodb+srv://username:password@cluster.xxxxx.mongodb.net/dbname');
    process.exit(1);
  }
}

// Start test
client.login(process.env.DISCORD_BOT_TOKEN).catch(error => {
  console.log('   ❌ Invalid Discord token:', error.message);
  console.log('\n   💡 Steps to fix:');
  console.log('   1. Go to https://discord.com/developers/applications');
  console.log('   2. Select your application');
  console.log('   3. Go to "Bot" tab');
  console.log('   4. Click "Reset Token" and copy the new token');
  console.log('   5. Update DISCORD_BOT_TOKEN in .env file');
  process.exit(1);
});
