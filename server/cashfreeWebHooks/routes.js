//express
const express = require("express");
const { handleWebhook } = require("./controller");
const route = express.Router();

/**
 * Middleware to capture raw body for signature verification
 * Cashfree requires the raw body (not parsed JSON) to verify webhook signatures
 */
const captureRawBody = express.json({ 
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
});

// Main webhook endpoint for all Cashfree payment events
// Note: captureRawBody middleware must be applied BEFORE express.json()
route.all("/webhooks", captureRawBody, handleWebhook);

module.exports = route;
