const { spawn } = require('child_process');
const crypto = require('crypto');

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('--- Starting Server Self-Test ---');

  const serverProcess = spawn('node', ['server.js'], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProcess.stdout.on('data', data => {
    process.stdout.write(`[SERVER OUT] ${data}`);
  });

  serverProcess.stderr.on('data', data => {
    process.stderr.write(`[SERVER ERR] ${data}`);
  });

  // Give server time to bind port
  await wait(1500);

  let allPassed = true;

  try {
    // 1. Health check test
    console.log('\n[Test 1] Testing GET / health check...');
    const healthRes = await fetch('http://localhost:3000/');
    const healthText = await healthRes.text();
    if (healthRes.status === 200 && healthText === 'WhatsApp webhook running') {
      console.log('✅ Pass: GET / returned 200 "WhatsApp webhook running"');
    } else {
      console.error(`❌ Fail: GET / returned ${healthRes.status}: "${healthText}"`);
      allPassed = false;
    }

    // 2. Webhook verification valid handshake
    console.log('\n[Test 2] Testing GET /webhook handshake (valid token)...');
    const verifyRes = await fetch('http://localhost:3000/webhook?hub.mode=subscribe&hub.verify_token=test_verify_token_123&hub.challenge=CHALLENGE_ACCEPTED_123');
    const verifyText = await verifyRes.text();
    if (verifyRes.status === 200 && verifyText === 'CHALLENGE_ACCEPTED_123') {
      console.log('✅ Pass: GET /webhook valid handshake succeeded with challenge');
    } else {
      console.error(`❌ Fail: GET /webhook returned ${verifyRes.status}: "${verifyText}"`);
      allPassed = false;
    }

    // 3. Webhook verification invalid token
    console.log('\n[Test 3] Testing GET /webhook handshake (invalid token)...');
    const invalidVerifyRes = await fetch('http://localhost:3000/webhook?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=test');
    if (invalidVerifyRes.status === 403) {
      console.log('✅ Pass: GET /webhook invalid token returned 403');
    } else {
      console.error(`❌ Fail: Expected 403, got ${invalidVerifyRes.status}`);
      allPassed = false;
    }

    // 4. POST /webhook signature rejection when APP_SECRET is set
    console.log('\n[Test 4] Testing POST /webhook signature verification (missing/invalid signature)...');
    const badSigRes = await fetch('http://localhost:3000/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: 'data' })
    });
    if (badSigRes.status === 401) {
      console.log('✅ Pass: Missing signature returned 401 Unauthorized');
    } else {
      console.error(`❌ Fail: Expected 401, got ${badSigRes.status}`);
      allPassed = false;
    }

    // 5. POST /webhook with valid signature and sample WhatsApp payload
    console.log('\n[Test 5] Testing POST /webhook with valid HMAC SHA256 signature & message payload...');
    const samplePayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '123456789',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '15550001111',
                  phone_number_id: '1234567890'
                },
                contacts: [{ profile: { name: 'John Doe' }, wa_id: '15551234567' }],
                messages: [
                  {
                    from: '15551234567',
                    id: 'wamid.test_message_1',
                    timestamp: '1700000000',
                    type: 'text',
                    text: { body: 'Hello Antigravity' }
                  }
                ],
                statuses: [
                  {
                    id: 'wamid.status_123',
                    status: 'delivered',
                    timestamp: '1700000005',
                    recipient_id: '15551234567'
                  }
                ]
              },
              field: 'messages'
            }
          ]
        }
      ]
    };

    const rawBody = JSON.stringify(samplePayload);
    const validSignature = 'sha256=' + crypto.createHmac('sha256', 'test_secret_abc').update(rawBody).digest('hex');

    const postRes = await fetch('http://localhost:3000/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': validSignature
      },
      body: rawBody
    });

    if (postRes.status === 200) {
      console.log('✅ Pass: Valid signed POST /webhook returned 200 OK');
    } else {
      console.error(`❌ Fail: POST /webhook returned ${postRes.status}`);
      allPassed = false;
    }

    // Wait a brief moment for async handlers to log
    await wait(1000);

  } catch (err) {
    console.error('Test execution error:', err);
    allPassed = false;
  } finally {
    serverProcess.kill();
  }

  if (allPassed) {
    console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! The server runs without errors.');
    process.exit(0);
  } else {
    console.error('\n❌ SOME TESTS FAILED.');
    process.exit(1);
  }
}

runTests();
