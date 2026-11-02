require('dotenv').config();

/**
 * Send a WhatsApp text message using Meta's Cloud API (Graph API v21.0)
 * @param {string} to - Recipient phone number (e.g. "15551234567")
 * @param {string} text - Message content to send
 * @returns {Promise<object|null>} API response or null if unconfigured
 */
async function sendTextMessage(to, text) {
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
  const whatsappToken = process.env.WHATSAPP_TOKEN;

  if (!phoneNumberId || !whatsappToken) {
    console.warn('[send.js] Skipping auto-reply: PHONE_NUMBER_ID or WHATSAPP_TOKEN is missing in environment variables.');
    return null;
  }

  const endpoint = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: {
      preview_url: false,
      body: text
    }
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${whatsappToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    let data;
    try {
      data = await response.json();
    } catch {
      data = { raw: await response.text().catch(() => '') };
    }

    if (!response.ok) {
      const errCode = data?.error?.code ?? 'N/A';
      const errSubcode = data?.error?.error_subcode ?? 'N/A';
      const errMsg = data?.error?.message ?? 'No error message provided';
      const errType = data?.error?.type ?? 'Unknown';

      console.error(`[send.js] Graph API error (${response.status}):`);
      console.error(`  - Code: ${errCode} | Subcode: ${errSubcode} | Type: ${errType}`);
      console.error(`  - Message: ${errMsg}`);
      console.error('  - Full Error Body:', JSON.stringify(data, null, 2));
      return data;
    }

    const messageId = data?.messages?.[0]?.id;
    console.log(`[send.js] Auto-reply sent to ${to} (Message ID: ${messageId || 'unknown'})`);
    console.log('[send.js] Graph API response:', JSON.stringify(data, null, 2));
    return data;
  } catch (err) {
    console.error('[send.js] Network/Request error:', err.message);
    return null;
  }
}

/**
 * Send an Interactive Button message (e.g. Yes / No options)
 * @param {string} to - Recipient phone number
 * @param {string} bodyText - Text displayed above the buttons
 * @param {Array<{id: string, title: string}>} buttons - Up to 3 buttons
 * @returns {Promise<object|null>} API response
 */
async function sendInteractiveButtons(to, bodyText, buttons = []) {
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
  const whatsappToken = process.env.WHATSAPP_TOKEN;

  if (!phoneNumberId || !whatsappToken) {
    console.warn('[send.js] Skipping interactive reply: PHONE_NUMBER_ID or WHATSAPP_TOKEN missing.');
    return null;
  }

  const endpoint = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: bodyText
      },
      action: {
        buttons: buttons.map(b => ({
          type: 'reply',
          reply: {
            id: b.id,
            title: b.title.slice(0, 20) // Meta max title length is 20 chars
          }
        }))
      }
    }
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${whatsappToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    let data;
    try {
      data = await response.json();
    } catch {
      data = { raw: await response.text().catch(() => '') };
    }

    if (!response.ok) {
      console.error(`[send.js] Interactive message error (${response.status}):`, JSON.stringify(data, null, 2));
      return data;
    }

    const messageId = data?.messages?.[0]?.id;
    console.log(`[send.js] Interactive buttons sent to ${to} (Message ID: ${messageId || 'unknown'})`);
    return data;
  } catch (err) {
    console.error('[send.js] Network error sending interactive message:', err.message);
    return null;
  }
}

module.exports = { sendTextMessage, sendInteractiveButtons };

