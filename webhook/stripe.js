const express = require('express');
const bodyParser = require('body-parser');
const stripe = require('stripe')(require('../config').STRIPE_SECRET_KEY);
const { WEBHOOK_SECRET } = require('../config');
const { saveInvoice } = require('../db');

const router = express.Router();
router.post('/stripe', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (
    event.type === 'invoice.paid' ||
    event.type === 'invoice.payment_failed' ||
    event.type === 'invoice.finalized'
  ) {
    const invoice = event.data.object;
    try {
      await saveInvoice({
        customer_email: invoice.customer_email || '',
        amount: invoice.amount_due / 100,
        currency: invoice.currency,
        description: invoice.description || '',
        status: invoice.status,
        platform: 'stripe',
        transaction_id: invoice.id,
        notified: true
      });
      console.log(`🔔 Invoice event: ${event.type} for invoice ${invoice.id}`);
    } catch (err) {
      console.error('Failed to update invoice in DB:', err.message);
    }
  }
  res.status(200).send('OK');
});

module.exports = router;
