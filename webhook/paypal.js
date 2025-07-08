const express = require('express');
const bodyParser = require('body-parser');
const { saveInvoice } = require('../db');
const paypal = require('@paypal/checkout-server-sdk');

const environment = new paypal.core.SandboxEnvironment(
  require('../config').PAYPAL_CLIENT_ID,
  require('../config').PAYPAL_CLIENT_SECRET
);
const client = new paypal.core.PayPalHttpClient(environment);

const router = express.Router();
router.post('/paypal', bodyParser.json(), async (req, res) => {
  const webhookEvent = req.body;
  // For production, verify the webhook signature!
  if (
    webhookEvent.event_type === 'INVOICING.INVOICE.PAID' ||
    webhookEvent.event_type === 'INVOICING.INVOICE.CANCELLED' ||
    webhookEvent.event_type === 'INVOICING.INVOICE.REFUNDED'
  ) {
    const invoice = webhookEvent.resource;
    try {
      await saveInvoice({
        customer_email: invoice.primary_recipients?.[0]?.billing_info?.email_address || '',
        amount: invoice.amount?.value || 0,
        currency: invoice.amount?.currency_code || '',
        description: invoice.note || '',
        status: invoice.status,
        platform: 'paypal',
        transaction_id: invoice.id,
        notified: true
      });
      console.log(`🔔 PayPal Invoice event: ${webhookEvent.event_type} for invoice ${invoice.id}`);
    } catch (err) {
      console.error('Failed to update PayPal invoice in DB:', err.message);
    }
  }
  res.status(200).send('OK');
});

module.exports = router;