/**
 * Raw Moomoo API Connection Test
 * Tests direct moomoo-api connection without adapter layer
 */

require('dotenv').config();
const MoomooAPI = require('moomoo-api').default;

console.log('=== Raw Moomoo API Connection Test ===\n');
console.log('Testing direct moomoo-api connection...\n');

const moomoo = new MoomooAPI();

const port = parseInt(process.env.MOOMOO_PORT) || 11111;
const websocketKey = process.env.MOOMOO_WEBSOCKET_KEY || '';

console.log('Configuration:');
console.log('  Host: 127.0.0.1');
console.log('  Port:', port);
console.log('  SSL: false');
console.log('  WebSocket Key:', websocketKey ? 'Configured ✓' : 'Not set');
console.log('  Password: ***\n');

console.log('Setting up connection handler...');

moomoo.onlogin = (ret, msg) => {
  console.log('\n[onlogin callback triggered]');
  console.log('  Return code:', ret);
  console.log('  Message:', msg);

  if (ret === 0) {
    console.log('✅ Connection successful!\n');

    console.log('Getting connection ID...');
    const connID = moomoo.getConnID();
    console.log('  Connection ID:', connID, '\n');

    console.log('✅ Raw API test passed!');
    console.log('OpenD Gateway is accepting connections.');
    console.log('\nNow testing UnlockTrade...');

    moomoo.UnlockTrade({
      c2s: {
        unlock: true,
        pwdMD5: process.env.MOOMOO_PASSWORD,
        securityFirm: 0
      }
    }).then(result => {
      console.log('✅ UnlockTrade successful!');
      console.log('Result:', JSON.stringify(result, null, 2));

      console.log('\nNow getting account list...');
      return moomoo.GetAccList({ c2s: { userID: 0 } });
    }).then(accountList => {
      console.log('✅ GetAccList successful!');
      console.log('Accounts:', JSON.stringify(accountList, null, 2));

      moomoo.stop();
      process.exit(0);
    }).catch(error => {
      console.error('❌ API call failed:', error.message);
      moomoo.stop();
      process.exit(1);
    });
  } else {
    console.log('❌ Connection failed!');
    console.log(`  Return code: ${ret}`);
    console.log(`  Message: ${msg}\n`);

    console.log('Troubleshooting:');
    console.log('1. Check OpenD Gateway is running');
    console.log('2. Check OpenD Gateway is logged in');
    console.log('3. Check port 11111 in OpenD settings');
    console.log('4. Try restarting OpenD Gateway');
    process.exit(1);
  }
};

console.log('Connecting to OpenD Gateway...');
console.log('(waiting up to 30 seconds for connection...)\n');

try {
  // Pass WebSocket key as the 4th parameter (not password)
  // The API signature is: start(ip, port, ssl, key)
  // Try without key first - OpenD may not require it for local connections
  console.log('Attempting connection without WebSocket key...');
  moomoo.start('127.0.0.1', port, false, '');
} catch (error) {
  console.error('❌ Failed to start connection:', error.message);
  process.exit(1);
}

// Timeout after 30 seconds
setTimeout(() => {
  console.error('\n❌ Connection timeout after 30 seconds');
  console.error('\nPossible issues:');
  console.error('1. OpenD Gateway not running');
  console.error('2. OpenD Gateway not logged in');
  console.error('3. Firewall blocking localhost connections');
  console.error('4. Wrong port (check OpenD Gateway settings)');
  console.error('5. OpenD Gateway needs restart');
  process.exit(1);
}, 30000);
