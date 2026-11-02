# Minimal WhatsApp Cloud API Webhook Server (Node.js & Express)

A lightweight Node.js Express server to handle Meta WhatsApp Cloud API webhooks with verification, signature validation, incoming message auto-reply, and status update logging.

---

## Features

- **Verification Handshake (`GET /webhook`)**: Verifies `hub.mode` and `hub.verify_token`, responding with `hub.challenge`.
- **Message & Status Handling (`POST /webhook`)**: Responds `200 OK` immediately, logs full payload, prints clean one-line summaries for incoming messages and delivery statuses, and auto-replies to text messages.
- **HMAC SHA256 Signature Verification**: If `APP_SECRET` is defined, automatically validates the `X-Hub-Signature-256` header on incoming POST webhooks.
- **Outbound Messaging (`send.js`)**: Sends text messages via Meta Graph API v21.0 using the native Node.js `fetch`.
- **Health Check (`GET /`)**: Simple endpoint returning `"WhatsApp webhook running"`.

---

## 1. Prerequisites

- [Node.js](https://nodejs.org/) v18+ (tested on v22)
- A Meta for Developers account with a WhatsApp Business App configured
- [ngrok](https://ngrok.com/) (or Cloudflare Tunnels / Localtunnel) for exposing your local server to the internet

---

## 2. Setup & Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

3. Fill in the values in `.env`:
   ```env
   PORT=3000
   VERIFY_TOKEN=my_secure_verify_token
   APP_SECRET=your_meta_app_secret_here
   PHONE_NUMBER_ID=your_phone_number_id_here
   WHATSAPP_TOKEN=your_whatsapp_access_token_here
   ```

---

## 3. Running Locally & Exposing with ngrok

1. **Start the Express server**:
   ```bash
   npm start
   ```
   The server will start at `http://localhost:3000`.

2. **Expose port 3000 using ngrok**:
   In a separate terminal, run:
   ```bash
   ngrok http 3000
   ```
   Copy the `https://` forwarding URL provided by ngrok (e.g., `https://abcdef1234.ngrok-free.app`).

---

## 4. Meta Dashboard Configuration

1. Go to the [Meta App Dashboard](https://developers.facebook.com/apps/).
2. Select your App and navigate to **WhatsApp** > **Configuration**.
3. Under the **Webhook** section, click **Edit**:
   - **Callback URL**: `https://<your-ngrok-url>/webhook` (e.g. `https://abcdef1234.ngrok-free.app/webhook`)
   - **Verify token**: The value you set for `VERIFY_TOKEN` in `.env` (e.g. `my_secure_verify_token`)
4. Click **Verify and Save**. Your server will log `[Webhook Verification] Success!` and respond with the challenge.
5. In the Webhook fields table, click **Manage** and subscribe to **`messages`**.

---

## 5. Testing Two-Way Messaging

1. Send a WhatsApp message from your personal phone to your WhatsApp Business test number.
2. The server terminal will log:
   ```text
   [Message] From: 15551234567 | Text: "Hello"
   [send.js] Auto-reply sent to 15551234567 (Message ID: wamid.HBg...)
   ```
3. You will receive an automatic reply on your phone:
   ```text
   Got your message: Hello
   ```
4. Delivery status updates (`sent`, `delivered`, `read`) will be logged in real-time:
   ```text
   [Status] Recipient: 15551234567 | Status: sent | ID: wamid.HBg...
   [Status] Recipient: 15551234567 | Status: delivered | ID: wamid.HBg...
   ```
