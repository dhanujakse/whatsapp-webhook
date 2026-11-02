require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const { sendTextMessage, sendInteractiveButtons } = require('./send');

const app = express();
const PORT = process.env.PORT || 3000;

// Capture raw body for HMAC SHA256 signature verification
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));

/**
 * Middleware to verify X-Hub-Signature-256 when APP_SECRET is configured
 */
function verifyMetaSignature(req, res, next) {
  const appSecret = process.env.APP_SECRET;
  if (!appSecret) {
    return next();
  }

  const signatureHeader = req.headers['x-hub-signature-256'];
  if (!signatureHeader) {
    console.warn('[Security] Rejecting request: Missing X-Hub-Signature-256 header.');
    return res.status(401).send('Signature header missing');
  }

  const parts = signatureHeader.split('=');
  if (parts.length !== 2 || parts[0] !== 'sha256') {
    console.warn('[Security] Rejecting request: Invalid signature format in X-Hub-Signature-256.');
    return res.status(401).send('Invalid signature format');
  }

  const signatureHash = parts[1];
  const expectedHash = crypto
    .createHmac('sha256', appSecret)
    .update(req.rawBody || '')
    .digest('hex');

  const signatureBuffer = Buffer.from(signatureHash, 'utf8');
  const expectedBuffer = Buffer.from(expectedHash, 'utf8');

  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    console.warn('[Security] Rejecting request: Signature validation failed (hash mismatch).');
    return res.status(401).send('Invalid signature');
  }

  next();
}

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).send('WhatsApp webhook running');
});

// Meta Webhook Verification handshake
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expectedToken = process.env.VERIFY_TOKEN;

  if (mode === 'subscribe' && token && token === expectedToken) {
    console.log('[Webhook Verification] Success! Responding with challenge.');
    return res.status(200).send(challenge);
  }

  console.warn('[Webhook Verification] Handshake failed. Invalid verify token or mode.');
  return res.sendStatus(403);
});

// Incoming messages and status updates
app.post('/webhook', verifyMetaSignature, async (req, res) => {
  // Respond 200 OK immediately to acknowledge receipt to Meta
  res.sendStatus(200);

  try {
    // Log full JSON payload
    console.log('\n--- Incoming Webhook Payload ---');
    console.log(JSON.stringify(req.body, null, 2));
    console.log('--------------------------------\n');

    const body = req.body;

    // Helper to process message and status values
    const processValue = async (value) => {
      if (!value) return;

      // Process incoming messages
      if (Array.isArray(value.messages)) {
        for (const message of value.messages) {
          const sender = message.from;

          // 1. User sends a text message (e.g. "Hi", "Hello")
          if (message.type === 'text' && message.text?.body) {
            const text = message.text.body;
            console.log(`[Message] From: ${sender} | Text: "${text}"`);

            // Automatically send Interactive Yes / No Buttons
            try {
              await sendInteractiveButtons(
                sender,
                `Hello! Thanks for reaching out. Would you like to proceed?`,
                [
                  { id: 'btn_yes', title: 'Yes' },
                  { id: 'btn_no', title: 'No' }
                ]
              );
            } catch (err) {
              console.error(`[Auto-reply Error] Could not reply to ${sender}:`, err?.message || err);
            }
          }
          // 2. User tapped an Interactive Button (e.g. "Yes" or "No")
          else if (message.type === 'interactive') {
            const buttonId = message.interactive?.button_reply?.id;
            const buttonTitle = message.interactive?.button_reply?.title;
            console.log(`[Button Click] From: ${sender} | Selected: "${buttonTitle}" (ID: ${buttonId})`);

            try {
              if (buttonId === 'btn_yes') {
                await sendTextMessage(sender, "Awesome! You selected Yes. How can we help you today?");
              } else if (buttonId === 'btn_no') {
                await sendTextMessage(sender, "Understood! You selected No. Feel free to text us anytime.");
              } else {
                await sendTextMessage(sender, `You chose: ${buttonTitle}`);
              }
            } catch (err) {
              console.error(`[Button Reply Error] Could not reply to ${sender}:`, err?.message || err);
            }
          }
          // 3. Other message types (image, audio, location, etc.)
          else {
            const extra = message[message.type]?.caption || message[message.type]?.title || '';
            console.log(`[Message] From: ${sender} | Type: ${message.type}${extra ? ` | Content: "${extra}"` : ''}`);
          }
        }
      }

      // Process status updates (sent, delivered, read, failed)
      if (Array.isArray(value.statuses)) {
        for (const statusItem of value.statuses) {
          const recipient = statusItem.recipient_id;
          const status = statusItem.status;
          const id = statusItem.id;
          let errorDetails = '';
          if (status === 'failed' && statusItem.errors) {
            errorDetails = ` | Errors: ${JSON.stringify(statusItem.errors)}`;
          }
          // Clean one-line summary
          console.log(`[Status] Recipient: ${recipient} | Status: ${status} | ID: ${id}${errorDetails}`);
        }
      }
    };

    // 1. Standard Meta Webhook envelope
    if (Array.isArray(body?.entry)) {
      for (const entry of body.entry) {
        const changes = entry?.changes || [];
        for (const change of changes) {
          await processValue(change?.value);
        }
      }
    }
    // 2. Direct Meta Dashboard Test tool payload (e.g. { field: "messages", value: { ... } })
    else if (body?.value) {
      await processValue(body.value);
    }
    // 3. Direct messages payload
    else if (Array.isArray(body?.messages)) {
      await processValue(body);
    }
  } catch (err) {
    // Catch-all: log error without crashing the server
    console.error('[Webhook Error] Error processing incoming webhook:', err?.message || err);
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`WhatsApp webhook server running on port ${PORT}`);
});
